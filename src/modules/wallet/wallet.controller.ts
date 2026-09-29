import { Request, Response, NextFunction } from 'express';
import { walletService } from './wallet.service';
import { ApiResponse } from '../../common/utils/api-response';

export class WalletController {
  async createWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await walletService.createWallet(req.body, req.user?.id);
      ApiResponse.created(res, result, 'Wallet created successfully');
    } catch (error) {
      next(error);
    }
  }

  async addMoney(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const result = await walletService.addMoney(walletId, req.body, req.user?.id);
      ApiResponse.success(
        res,
        result,
        `Successfully added funds to wallet. New balance: ${result.wallet.balance} ${result.wallet.currency}`
      );
    } catch (error) {
      next(error);
    }
  }

  async transferMoney(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const result = await walletService.transferMoney(walletId, req.body, req.user?.id);
      ApiResponse.success(
        res,
        result,
        `Successfully transferred ${result.amount} ${result.currency} to wallet '${result.receiverWalletId}'. Reference: ${result.referenceId}`
      );
    } catch (error) {
      next(error);
    }
  }

  async getWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const result = await walletService.getWalletById(walletId, req.user?.id);
      ApiResponse.success(res, result, 'Wallet retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getUserWallets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.params.userId || req.user?.id;
      if (!userId) {
        return next(new Error('User ID is required'));
      }
      const result = await walletService.getUserWallets(userId, req.user?.id);
      ApiResponse.success(res, result, 'User wallets retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getWalletSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const result = await walletService.getWalletSummary(walletId, req.user?.id);
      ApiResponse.success(res, result, 'Wallet summary calculated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const { status } = req.body;
      const result = await walletService.updateStatus(walletId, status, req.user?.id);
      ApiResponse.success(res, result, `Wallet status successfully updated to ${status}`);
    } catch (error) {
      next(error);
    }
  }
}

export const walletController = new WalletController();
