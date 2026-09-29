import { WalletStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { walletRepository, TransferResult, WalletSummaryResult } from './wallet.repository';
import { CreateWalletDto, AddMoneyDto, TransferMoneyDto } from './wallet.dto';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from '../../common/errors/app-error';

export class WalletService {
  async createWallet(dto: CreateWalletDto, authenticatedUserId?: string) {
    const targetUserId = authenticatedUserId || dto.userId;

    if (!targetUserId) {
      throw new BadRequestError('userId is required to create a wallet');
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      throw new NotFoundError(`User with ID '${targetUserId}' does not exist`);
    }

    const currency = (dto.currency || 'USD').toUpperCase();

    // Core Requirement: One active wallet per user (per currency)
    const existingActiveWallet = await walletRepository.findByUserAndCurrency(
      targetUserId,
      currency
    );

    if (existingActiveWallet && existingActiveWallet.status === 'ACTIVE') {
      throw new ConflictError(
        `User already has an active ${currency} wallet (Wallet ID: ${existingActiveWallet.id}). Only one active wallet per currency is allowed.`
      );
    }

    const wallet = await walletRepository.createWallet({
      userId: targetUserId,
      currency,
      initialBalance: dto.initialBalance,
      status: 'ACTIVE',
    });

    return wallet;
  }

  async addMoney(walletId: string, dto: AddMoneyDto, authenticatedUserId?: string) {
    return walletRepository.addMoneyAtomic(walletId, dto.amount, dto.description, authenticatedUserId);
  }

  async transferMoney(
    senderWalletId: string,
    dto: TransferMoneyDto,
    authenticatedUserId?: string
  ): Promise<TransferResult> {
    return walletRepository.transferMoneyAtomic(
      senderWalletId,
      dto.receiverWalletId,
      dto.amount,
      dto.description,
      authenticatedUserId
    );
  }

  async getWalletById(walletId: string, authenticatedUserId?: string) {
    const wallet = await walletRepository.findById(walletId);
    if (!wallet) {
      throw new NotFoundError(`Wallet with ID '${walletId}' not found`);
    }

    if (authenticatedUserId && wallet.userId !== authenticatedUserId) {
      throw new ForbiddenError('You do not have permission to view this wallet');
    }

    return wallet;
  }

  async getUserWallets(userId: string, authenticatedUserId?: string) {
    if (authenticatedUserId && authenticatedUserId !== userId) {
      throw new ForbiddenError('You can only view your own wallets');
    }

    return walletRepository.findByUserId(userId);
  }

  async getWalletSummary(
    walletId: string,
    authenticatedUserId?: string
  ): Promise<WalletSummaryResult> {
    const wallet = await walletRepository.findById(walletId);
    if (!wallet) {
      throw new NotFoundError(`Wallet with ID '${walletId}' not found`);
    }

    if (authenticatedUserId && wallet.userId !== authenticatedUserId) {
      throw new ForbiddenError('You do not have permission to view this wallet summary');
    }

    return walletRepository.getSummary(walletId);
  }

  async updateStatus(
    walletId: string,
    status: WalletStatus,
    authenticatedUserId?: string
  ) {
    const wallet = await walletRepository.findById(walletId);
    if (!wallet) {
      throw new NotFoundError(`Wallet with ID '${walletId}' not found`);
    }

    if (authenticatedUserId && wallet.userId !== authenticatedUserId) {
      throw new ForbiddenError('You do not have permission to update this wallet');
    }

    return walletRepository.updateStatus(walletId, status);
  }
}

export const walletService = new WalletService();
