import { Router } from 'express';
import { walletController } from './wallet.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createWalletSchema,
  addMoneySchema,
  transferMoneySchema,
  updateWalletStatusSchema,
  walletIdParamSchema,
} from './wallet.dto';
import { optionalJwt } from '../../middlewares/auth.middleware';
import { idempotency } from '../../middlewares/idempotency.middleware';

const router = Router();

// Apply optional JWT so endpoints support both token-authenticated users and direct userId calls
router.use(optionalJwt);

// 1. Create Wallet
router.post(
  '/',
  validateRequest({ body: createWalletSchema }),
  (req, res, next) => walletController.createWallet(req, res, next)
);

// 2. Add Money to Wallet (Protected with Idempotency)
router.post(
  '/:walletId/add-money',
  idempotency,
  validateRequest({
    params: walletIdParamSchema,
    body: addMoneySchema,
  }),
  (req, res, next) => walletController.addMoney(req, res, next)
);

// 3. Transfer Money between Wallets (Protected with Idempotency)
router.post(
  '/:walletId/transfer',
  idempotency,
  validateRequest({
    params: walletIdParamSchema,
    body: transferMoneySchema,
  }),
  (req, res, next) => walletController.transferMoney(req, res, next)
);

// 4. Get Wallet Details
router.get(
  '/:walletId',
  validateRequest({ params: walletIdParamSchema }),
  (req, res, next) => walletController.getWallet(req, res, next)
);

// 5. Get User Wallets
router.get('/user/:userId', (req, res, next) =>
  walletController.getUserWallets(req, res, next)
);

// 6. Get Wallet Summary (Current Balance, Total Credited, Total Debited, Net Volume)
router.get(
  '/:walletId/summary',
  validateRequest({ params: walletIdParamSchema }),
  (req, res, next) => walletController.getWalletSummary(req, res, next)
);

// 7. Update Wallet Status
router.patch(
  '/:walletId/status',
  validateRequest({
    params: walletIdParamSchema,
    body: updateWalletStatusSchema,
  }),
  (req, res, next) => walletController.updateStatus(req, res, next)
);

export const walletRoutes = router;
