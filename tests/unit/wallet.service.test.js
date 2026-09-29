"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../../src/config/database");
const wallet_service_1 = require("../../src/modules/wallet/wallet.service");
const app_error_1 = require("../../src/common/errors/app-error");
describe('WalletService Unit Tests', () => {
    let userA;
    let userB;
    beforeEach(async () => {
        const passwordHash = await bcryptjs_1.default.hash('Password123!', 10);
        userA = await database_1.prisma.user.create({
            data: { name: 'User A', email: 'userA@example.com', password: passwordHash },
        });
        userB = await database_1.prisma.user.create({
            data: { name: 'User B', email: 'userB@example.com', password: passwordHash },
        });
    });
    describe('Wallet Creation & Constraints', () => {
        it('should create an active wallet for a user with initial balance', async () => {
            const wallet = await wallet_service_1.walletService.createWallet({
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
            const transactions = await database_1.prisma.transaction.findMany({ where: { walletId: wallet.id } });
            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('CREDIT');
            expect(transactions[0].amount).toBe(500);
        });
        it('should enforce only one active wallet per user per currency', async () => {
            await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 100,
            });
            // Second attempt to create active USD wallet for User A must fail with ConflictError
            await expect(wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 200,
            })).rejects.toThrow(app_error_1.ConflictError);
        });
    });
    describe('Add Money', () => {
        it('should add money and update balance atomically with CREDIT transaction record', async () => {
            const wallet = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 100,
            });
            const result = await wallet_service_1.walletService.addMoney(wallet.id, {
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
            const wallet = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 100,
            });
            await wallet_service_1.walletService.updateStatus(wallet.id, 'FROZEN');
            await expect(wallet_service_1.walletService.addMoney(wallet.id, { amount: 50 })).rejects.toThrow(app_error_1.WalletInactiveError);
        });
    });
    describe('Transfer Money Validation & Business Rules', () => {
        it('should transfer money from User A to User B creating atomic DEBIT and CREDIT transactions', async () => {
            const walletA = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 500,
            });
            const walletB = await wallet_service_1.walletService.createWallet({
                userId: userB.id,
                currency: 'USD',
                initialBalance: 100,
            });
            const transfer = await wallet_service_1.walletService.transferMoney(walletA.id, {
                receiverWalletId: walletB.id,
                amount: 200,
                description: 'Payment for lunch',
            });
            expect(transfer.amount).toBe(200);
            expect(transfer.senderBalanceAfter).toBe(300);
            expect(transfer.receiverBalanceAfter).toBe(300);
            expect(transfer.referenceId).toMatch(/^TXF-/);
            // Verify transactions in database
            const senderTx = await database_1.prisma.transaction.findUnique({
                where: { id: transfer.senderTransactionId },
            });
            const receiverTx = await database_1.prisma.transaction.findUnique({
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
            const walletA = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 50,
            });
            const walletB = await wallet_service_1.walletService.createWallet({
                userId: userB.id,
                currency: 'USD',
                initialBalance: 100,
            });
            await expect(wallet_service_1.walletService.transferMoney(walletA.id, {
                receiverWalletId: walletB.id,
                amount: 200,
            })).rejects.toThrow(app_error_1.InsufficientFundsError);
            // Balances must remain unchanged
            const currentWalletA = await wallet_service_1.walletService.getWalletById(walletA.id);
            expect(currentWalletA.balance).toBe(50);
        });
        it('should reject transfer to same wallet or self-transfers between user own wallets', async () => {
            const walletA1 = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 100,
            });
            await expect(wallet_service_1.walletService.transferMoney(walletA1.id, {
                receiverWalletId: walletA1.id,
                amount: 50,
            })).rejects.toThrow(app_error_1.BadRequestError);
        });
        it('should reject transfer if either sender or receiver wallet is FROZEN', async () => {
            const walletA = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 500,
            });
            const walletB = await wallet_service_1.walletService.createWallet({
                userId: userB.id,
                currency: 'USD',
                initialBalance: 100,
            });
            await wallet_service_1.walletService.updateStatus(walletB.id, 'FROZEN');
            await expect(wallet_service_1.walletService.transferMoney(walletA.id, {
                receiverWalletId: walletB.id,
                amount: 100,
            })).rejects.toThrow(app_error_1.WalletInactiveError);
        });
    });
    describe('Wallet Summary Analytics', () => {
        it('should calculate accurate balance, total credited, and total debited amounts', async () => {
            const walletA = await wallet_service_1.walletService.createWallet({
                userId: userA.id,
                currency: 'USD',
                initialBalance: 1000, // CREDIT 1000
            });
            const walletB = await wallet_service_1.walletService.createWallet({
                userId: userB.id,
                currency: 'USD',
                initialBalance: 0,
            });
            // Deposit +500 (CREDIT)
            await wallet_service_1.walletService.addMoney(walletA.id, { amount: 500 });
            // Transfer -300 to Bob (DEBIT)
            await wallet_service_1.walletService.transferMoney(walletA.id, {
                receiverWalletId: walletB.id,
                amount: 300,
            });
            // Transfer -150 to Bob (DEBIT)
            await wallet_service_1.walletService.transferMoney(walletA.id, {
                receiverWalletId: walletB.id,
                amount: 150,
            });
            const summary = await wallet_service_1.walletService.getWalletSummary(walletA.id);
            expect(summary.currentBalance).toBe(1050); // 1000 + 500 - 300 - 150
            expect(summary.totalCredited).toBe(1500); // 1000 + 500
            expect(summary.totalDebited).toBe(450); // 300 + 150
            expect(summary.netVolume).toBe(1050);
            expect(summary.totalTransactions).toBe(4);
        });
    });
});
