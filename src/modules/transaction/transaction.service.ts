import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { TransactionFilterDto } from './transaction.dto';
import { parsePagination, buildPaginationMeta } from '../../common/utils/pagination';
import { NotFoundError, ForbiddenError } from '../../common/errors/app-error';

export class TransactionService {
  async getWalletTransactions(
    walletId: string,
    filters: TransactionFilterDto,
    authenticatedUserId?: string
  ) {
    // 1. Verify wallet exists
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundError(`Wallet with ID '${walletId}' not found`);
    }

    // 2. Ownership verification if authenticated
    if (authenticatedUserId && wallet.userId !== authenticatedUserId) {
      throw new ForbiddenError('You do not have permission to view transactions for this wallet');
    }

    // 3. Construct Prisma Where Filter
    const where: Prisma.TransactionWhereInput = {
      walletId,
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        where.createdAt.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        // Set end date to end of day if only date is passed
        const end = new Date(filters.toDate);
        if (filters.toDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    // 4. Pagination
    const { page, limit, skip } = parsePagination(filters.page, filters.limit);

    const [totalItems, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc',
        },
      }),
    ]);

    const meta = buildPaginationMeta(totalItems, page, limit);

    return { transactions, meta, wallet: { id: wallet.id, currency: wallet.currency, balance: wallet.balance } };
  }

  async getTransactionById(transactionId: string, authenticatedUserId?: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        wallet: {
          select: {
            id: true,
            userId: true,
            currency: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundError(`Transaction with ID '${transactionId}' not found`);
    }

    if (authenticatedUserId && transaction.wallet.userId !== authenticatedUserId) {
      throw new ForbiddenError('You do not have permission to view this transaction');
    }

    return transaction;
  }
}

export const transactionService = new TransactionService();
