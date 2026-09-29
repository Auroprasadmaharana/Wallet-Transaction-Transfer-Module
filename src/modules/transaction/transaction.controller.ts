import { Request, Response, NextFunction } from 'express';
import { transactionService } from './transaction.service';
import { ApiResponse } from '../../common/utils/api-response';
import { TransactionFilterDto } from './transaction.dto';

export class TransactionController {
  async getWalletTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const filters = req.query as unknown as TransactionFilterDto;

      const result = await transactionService.getWalletTransactions(
        walletId,
        filters,
        req.user?.id
      );

      ApiResponse.success(
        res,
        result.transactions,
        'Transactions retrieved successfully',
        200,
        result.meta
      );
    } catch (error) {
      next(error);
    }
  }

  async getTransactionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { transactionId } = req.params;
      const result = await transactionService.getTransactionById(transactionId, req.user?.id);
      ApiResponse.success(res, result, 'Transaction retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const transactionController = new TransactionController();
