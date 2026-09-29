import { Prisma, Wallet, WalletStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  BadRequestError,
  InsufficientFundsError,
  WalletInactiveError,
  ForbiddenError,
} from '../../common/errors/app-error';

export interface TransferResult {
  referenceId: string;
  amount: number;
  currency: string;
  senderWalletId: string;
  receiverWalletId: string;
  senderBalanceAfter: number;
  receiverBalanceAfter: number;
  senderTransactionId: string;
  receiverTransactionId: string;
  createdAt: Date;
}

export interface WalletSummaryResult {
  walletId: string;
  userId: string;
  currency: string;
  status: WalletStatus;
  currentBalance: number;
  totalCredited: number;
  totalDebited: number;
  netVolume: number;
  totalTransactions: number;
  createdAt: Date;
}

// Resilient transaction executor with exponential jitter for concurrent DB lock contention
async function executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 8): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: unknown) {
      attempt++;
      const err = error as { message?: string; code?: string };
      const isLockContention =
        err?.message?.includes('database is locked') ||
        err?.message?.includes('busy') ||
        err?.message?.includes('Timed out') ||
        err?.code === 'P2034' ||
        err?.code === 'P2028' ||
        err?.code === '40P01' ||
        err?.code === '40001';

      if (isLockContention && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 50) + attempt * 60;
        await new Promise((resolve) => setTimeout(resolve, jitter));
        continue;
      }
      throw error;
    }
  }
  return operation();
}

export class WalletRepository {
  async createWallet(data: {
    userId: string;
    currency: string;
    initialBalance?: number;
    status?: WalletStatus;
  }): Promise<Wallet> {
    const initialBalance = data.initialBalance || 0;
    const roundedInitialBalance = Number(initialBalance.toFixed(2));

    return executeWithRetry(async () => {
      return prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.create({
          data: {
            userId: data.userId,
            currency: data.currency,
            balance: roundedInitialBalance,
            status: data.status || 'ACTIVE',
          },
        });

        if (roundedInitialBalance > 0) {
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              amount: roundedInitialBalance,
              type: 'CREDIT',
              category: 'DEPOSIT',
              status: 'SUCCESS',
              balanceBefore: 0.0,
              balanceAfter: roundedInitialBalance,
              description: 'Initial deposit upon wallet creation',
            },
          });
        }

        return wallet;
      });
    });
  }

  async findById(id: string) {
    return executeWithRetry(async () => {
      return prisma.wallet.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });
  }

  async findByUserId(userId: string) {
    return executeWithRetry(async () => {
      return prisma.wallet.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findActiveByUserId(userId: string) {
    return executeWithRetry(async () => {
      return prisma.wallet.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });
    });
  }

  async findByUserAndCurrency(userId: string, currency: string) {
    return executeWithRetry(async () => {
      return prisma.wallet.findUnique({
        where: {
          user_currency_unique: {
            userId,
            currency,
          },
        },
      });
    });
  }

  async updateStatus(id: string, status: WalletStatus): Promise<Wallet> {
    return executeWithRetry(async () => {
      return prisma.wallet.update({
        where: { id },
        data: { status },
      });
    });
  }

  async addMoneyAtomic(
    walletId: string,
    amount: number,
    description?: string,
    authenticatedUserId?: string
  ) {
    const roundedAmount = Number(amount.toFixed(2));

    return executeWithRetry(async () => {
      return prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { id: walletId },
        });

        if (!wallet) {
          throw new NotFoundError(`Wallet with ID '${walletId}' not found`);
        }

        if (authenticatedUserId && wallet.userId !== authenticatedUserId) {
          throw new ForbiddenError('You do not have permission to add funds to this wallet');
        }

        if (wallet.status !== 'ACTIVE') {
          throw new WalletInactiveError(
            `Cannot add money: Wallet status is '${wallet.status}'. Only ACTIVE wallets can transact.`
          );
        }

        const balanceBefore = Number(wallet.balance.toFixed(2));
        const balanceAfter = Number((balanceBefore + roundedAmount).toFixed(2));

        const updatedWallet = await tx.wallet.update({
          where: { id: walletId },
          data: {
            balance: balanceAfter,
            version: { increment: 1 },
          },
        });

        const transaction = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: roundedAmount,
            type: 'CREDIT',
            category: 'DEPOSIT',
            status: 'SUCCESS',
            balanceBefore,
            balanceAfter,
            description: description || `Deposit of ${roundedAmount} ${wallet.currency}`,
          },
        });

        return { wallet: updatedWallet, transaction };
      });
    });
  }

  /**
   * Atomic Money Transfer with Concurrency Lock Ordering
   * Eliminates deadlocks by sorting wallet IDs prior to transactional access.
   */
  async transferMoneyAtomic(
    senderWalletId: string,
    receiverWalletId: string,
    amount: number,
    description?: string,
    authenticatedUserId?: string
  ): Promise<TransferResult> {
    if (senderWalletId === receiverWalletId) {
      throw new BadRequestError('Sender wallet and Receiver wallet must be different');
    }

    const roundedAmount = Number(amount.toFixed(2));
    const referenceId = `TXF-${uuidv4()}`;

    return executeWithRetry(async () => {
      return prisma.$transaction(
        async (tx) => {
          // Fetch wallets in deterministic order to prevent database deadlocks
          const [firstId, secondId] = [senderWalletId, receiverWalletId].sort();

          const firstWallet = await tx.wallet.findUnique({
            where: { id: firstId },
            include: { user: { select: { id: true, name: true, email: true } } },
          });

          const secondWallet = await tx.wallet.findUnique({
            where: { id: secondId },
            include: { user: { select: { id: true, name: true, email: true } } },
          });

          if (!firstWallet) {
            throw new NotFoundError(`Wallet with ID '${firstId}' not found`);
          }
          if (!secondWallet) {
            throw new NotFoundError(`Wallet with ID '${secondId}' not found`);
          }

          const senderWallet = firstWallet.id === senderWalletId ? firstWallet : secondWallet;
          const receiverWallet = firstWallet.id === receiverWalletId ? firstWallet : secondWallet;

          // Ownership verification
          if (authenticatedUserId && senderWallet.userId !== authenticatedUserId) {
            throw new ForbiddenError('You can only transfer funds from your own wallet');
          }

          // Validation 1: Prevent transferring to self (same user)
          if (senderWallet.userId === receiverWallet.userId) {
            throw new BadRequestError('Cannot transfer money to another wallet owned by the same user');
          }

          // Validation 2: Status check
          if (senderWallet.status !== 'ACTIVE') {
            throw new WalletInactiveError(
              `Sender wallet '${senderWallet.id}' is ${senderWallet.status}. Transfers require an ACTIVE wallet.`
            );
          }
          if (receiverWallet.status !== 'ACTIVE') {
            throw new WalletInactiveError(
              `Receiver wallet '${receiverWallet.id}' is ${receiverWallet.status}. Transfers require an ACTIVE wallet.`
            );
          }

          // Validation 3: Currency compatibility
          if (senderWallet.currency !== receiverWallet.currency) {
            throw new BadRequestError(
              `Currency mismatch: Sender wallet is in ${senderWallet.currency} but Receiver wallet is in ${receiverWallet.currency}.`
            );
          }

          // Validation 4: Sufficient Balance
          const senderBalanceBefore = Number(senderWallet.balance.toFixed(2));
          if (senderBalanceBefore < roundedAmount) {
            throw new InsufficientFundsError(
              `Insufficient balance. Available: ${senderBalanceBefore} ${senderWallet.currency}, Requested: ${roundedAmount} ${senderWallet.currency}`
            );
          }

          const senderBalanceAfter = Number((senderBalanceBefore - roundedAmount).toFixed(2));
          const receiverBalanceBefore = Number(receiverWallet.balance.toFixed(2));
          const receiverBalanceAfter = Number((receiverBalanceBefore + roundedAmount).toFixed(2));

          // Update Sender Wallet
          await tx.wallet.update({
            where: { id: senderWallet.id },
            data: {
              balance: senderBalanceAfter,
              version: { increment: 1 },
            },
          });

          // Update Receiver Wallet
          await tx.wallet.update({
            where: { id: receiverWallet.id },
            data: {
              balance: receiverBalanceAfter,
              version: { increment: 1 },
            },
          });

          // Create Sender DEBIT Transaction
          const senderTx = await tx.transaction.create({
            data: {
              walletId: senderWallet.id,
              amount: roundedAmount,
              type: 'DEBIT',
              category: 'TRANSFER_OUT',
              status: 'SUCCESS',
              balanceBefore: senderBalanceBefore,
              balanceAfter: senderBalanceAfter,
              referenceId,
              senderWalletId: senderWallet.id,
              receiverWalletId: receiverWallet.id,
              description:
                description ||
                `Transfer to ${receiverWallet.user?.name || receiverWallet.id}`,
              metadata: JSON.stringify({
                counterpartyUserId: receiverWallet.userId,
                counterpartyName: receiverWallet.user?.name,
              }),
            },
          });

          // Create Receiver CREDIT Transaction
          const receiverTx = await tx.transaction.create({
            data: {
              walletId: receiverWallet.id,
              amount: roundedAmount,
              type: 'CREDIT',
              category: 'TRANSFER_IN',
              status: 'SUCCESS',
              balanceBefore: receiverBalanceBefore,
              balanceAfter: receiverBalanceAfter,
              referenceId,
              senderWalletId: senderWallet.id,
              receiverWalletId: receiverWallet.id,
              description:
                description ||
                `Transfer from ${senderWallet.user?.name || senderWallet.id}`,
              metadata: JSON.stringify({
                counterpartyUserId: senderWallet.userId,
                counterpartyName: senderWallet.user?.name,
              }),
            },
          });

          return {
            referenceId,
            amount: roundedAmount,
            currency: senderWallet.currency,
            senderWalletId: senderWallet.id,
            receiverWalletId: receiverWallet.id,
            senderBalanceAfter,
            receiverBalanceAfter,
            senderTransactionId: senderTx.id,
            receiverTransactionId: receiverTx.id,
            createdAt: senderTx.createdAt,
          };
        },
        {
          timeout: 20000,
        }
      );
    });
  }

  async getSummary(walletId: string): Promise<WalletSummaryResult> {
    const wallet = await this.findById(walletId);
    if (!wallet) {
      throw new NotFoundError(`Wallet with ID '${walletId}' not found`);
    }

    return executeWithRetry(async () => {
      const aggregations = await prisma.transaction.groupBy({
        by: ['type'],
        where: {
          walletId,
          status: 'SUCCESS',
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      });

      let totalCredited = 0;
      let totalDebited = 0;
      let totalTransactions = 0;

      for (const agg of aggregations) {
        const sum = agg._sum.amount || 0;
        const count = agg._count.id || 0;
        totalTransactions += count;

        if (agg.type === 'CREDIT') {
          totalCredited += sum;
        } else if (agg.type === 'DEBIT') {
          totalDebited += sum;
        }
      }

      return {
        walletId: wallet.id,
        userId: wallet.userId,
        currency: wallet.currency,
        status: wallet.status,
        currentBalance: Number(wallet.balance.toFixed(2)),
        totalCredited: Number(totalCredited.toFixed(2)),
        totalDebited: Number(totalDebited.toFixed(2)),
        netVolume: Number((totalCredited - totalDebited).toFixed(2)),
        totalTransactions,
        createdAt: wallet.createdAt,
      };
    });
  }
}

export const walletRepository = new WalletRepository();
