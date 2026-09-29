import { Router } from 'express';
import { transactionController } from './transaction.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  transactionFilterSchema,
  transactionIdParamSchema,
} from './transaction.dto';
import { walletIdParamSchema } from '../wallet/wallet.dto';
import { optionalJwt } from '../../middlewares/auth.middleware';

const router = Router();

router.use(optionalJwt);

// Get transactions for a specific wallet with pagination & filters
router.get(
  '/wallet/:walletId',
  validateRequest({
    params: walletIdParamSchema,
    query: transactionFilterSchema,
  }),
  (req, res, next) => transactionController.getWalletTransactions(req, res, next)
);

// Get specific transaction by transaction ID
router.get(
  '/:transactionId',
  validateRequest({ params: transactionIdParamSchema }),
  (req, res, next) => transactionController.getTransactionById(req, res, next)
);

export const transactionRoutes = router;
