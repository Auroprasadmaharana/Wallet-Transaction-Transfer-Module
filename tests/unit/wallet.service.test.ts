import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/database';
import { walletService } from '../../src/modules/wallet/wallet.service';
import {
  InsufficientFundsError,
  BadRequestError,
  ConflictError,
  WalletInactiveError,
} from '../../src/common/errors/app-error';

describe('WalletService Unit Tests', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    userA = await prisma.user.create({
      data: { name: 'User A', email: 'userA@example.com', password: passwordHash },
    });
    userB = await prisma.user.create({
      data: { name: 'User B', email: 'userB@example.com', password: passwordHash },
    });
  });

  describe('Wallet Creation & Constraints', () => {
    it('should create an active wallet for a user with initial balance', async () => {
      const wallet = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 500,
      });

      expect(wallet).toBeDefined();
      expect(wallet.userId).toBe(userA.id);
      expect(wallet.balance).toBe(500);
      expect(wallet.currency).toBe('USD');
      expect(wallet.status).toBe('ACTIVE');

      // Verify initial transaction record created
      const transactions = await prisma.transaction.findMany({ where: { walletId: wallet.id } });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe('CREDIT');
      expect(transactions[0].amount).toBe(500);
    });

    it('should enforce only one active wallet per user per currency', async () => {
      await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 100,
      });

      // Second attempt to create active USD wallet for User A must fail with ConflictError
      await expect(
        walletService.createWallet({
          userId: userA.id,
          currency: 'USD',
          initialBalance: 200,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('Add Money', () => {
    it('should add money and update balance atomically with CREDIT transaction record', async () => {
      const wallet = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 100,
      });

      const result = await walletService.addMoney(wallet.id, {
        amount: 250,
        description: 'Direct Deposit',
      });

      expect(result.wallet.balance).toBe(350);
      expect(result.transaction.amount).toBe(250);
      expect(result.transaction.type).toBe('CREDIT');
      expect(result.transaction.balanceBefore).toBe(100);
      expect(result.transaction.balanceAfter).toBe(350);
    });

    it('should reject adding money to an INACTIVE or FROZEN wallet', async () => {
      const wallet = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 100,
      });

      await walletService.updateStatus(wallet.id, 'FROZEN');

      await expect(
        walletService.addMoney(wallet.id, { amount: 50 })
      ).rejects.toThrow(WalletInactiveError);
    });
  });

  describe('Transfer Money Validation & Business Rules', () => {
    it('should transfer money from User A to User B creating atomic DEBIT and CREDIT transactions', async () => {
      const walletA = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 500,
      });

      const walletB = await walletService.createWallet({
        userId: userB.id,
        currency: 'USD',
        initialBalance: 100,
      });

      const transfer = await walletService.transferMoney(walletA.id, {
        receiverWalletId: walletB.id,
        amount: 200,
        description: 'Payment for lunch',
      });

      expect(transfer.amount).toBe(200);
      expect(transfer.senderBalanceAfter).toBe(300);
      expect(transfer.receiverBalanceAfter).toBe(300);
      expect(transfer.referenceId).toMatch(/^TXF-/);

      // Verify transactions in database
      const senderTx = await prisma.transaction.findUnique({
        where: { id: transfer.senderTransactionId },
      });
      const receiverTx = await prisma.transaction.findUnique({
        where: { id: transfer.receiverTransactionId },
      });

      expect(senderTx?.type).toBe('DEBIT');
      expect(senderTx?.amount).toBe(200);
      expect(senderTx?.balanceBefore).toBe(500);
      expect(senderTx?.balanceAfter).toBe(300);

      expect(receiverTx?.type).toBe('CREDIT');
      expect(receiverTx?.amount).toBe(200);
      expect(receiverTx?.balanceBefore).toBe(100);
      expect(receiverTx?.balanceAfter).toBe(300);
    });

    it('should reject transfer when sender has insufficient balance', async () => {
      const walletA = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 50,
      });

      const walletB = await walletService.createWallet({
        userId: userB.id,
        currency: 'USD',
        initialBalance: 100,
      });

      await expect(
        walletService.transferMoney(walletA.id, {
          receiverWalletId: walletB.id,
          amount: 200,
        })
      ).rejects.toThrow(InsufficientFundsError);

      // Balances must remain unchanged
      const currentWalletA = await walletService.getWalletById(walletA.id);
      expect(currentWalletA.balance).toBe(50);
    });

    it('should reject transfer to same wallet or self-transfers between user own wallets', async () => {
      const walletA1 = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 100,
      });

      await expect(
        walletService.transferMoney(walletA1.id, {
          receiverWalletId: walletA1.id,
          amount: 50,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should reject transfer if either sender or receiver wallet is FROZEN', async () => {
      const walletA = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 500,
      });

      const walletB = await walletService.createWallet({
        userId: userB.id,
        currency: 'USD',
        initialBalance: 100,
      });

      await walletService.updateStatus(walletB.id, 'FROZEN');

      await expect(
        walletService.transferMoney(walletA.id, {
          receiverWalletId: walletB.id,
          amount: 100,
        })
      ).rejects.toThrow(WalletInactiveError);
    });
  });

  describe('Wallet Summary Analytics', () => {
    it('should calculate accurate balance, total credited, and total debited amounts', async () => {
      const walletA = await walletService.createWallet({
        userId: userA.id,
        currency: 'USD',
        initialBalance: 1000, // CREDIT 1000
      });

      const walletB = await walletService.createWallet({
        userId: userB.id,
        currency: 'USD',
        initialBalance: 0,
      });

      // Deposit +500 (CREDIT)
      await walletService.addMoney(walletA.id, { amount: 500 });

      // Transfer -300 to Bob (DEBIT)
      await walletService.transferMoney(walletA.id, {
        receiverWalletId: walletB.id,
        amount: 300,
      });

      // Transfer -150 to Bob (DEBIT)
      await walletService.transferMoney(walletA.id, {
        receiverWalletId: walletB.id,
        amount: 150,
      });

      const summary = await walletService.getWalletSummary(walletA.id);

      expect(summary.currentBalance).toBe(1050); // 1000 + 500 - 300 - 150
      expect(summary.totalCredited).toBe(1500); // 1000 + 500
      expect(summary.totalDebited).toBe(450); // 300 + 150
      expect(summary.netVolume).toBe(1050);
      expect(summary.totalTransactions).toBe(4);
    });
  });
});
