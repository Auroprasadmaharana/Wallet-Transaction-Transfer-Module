import { z } from 'zod';

export const createWalletSchema = z.object({
  userId: z.string().uuid('Invalid user ID format').optional(),
  currency: z
    .string()
    .min(3, 'Currency must be 3 letters (e.g. USD, EUR, INR)')
    .max(3, 'Currency must be 3 letters')
    .toUpperCase()
    .default('USD'),
  initialBalance: z
    .number()
    .nonnegative('Initial balance cannot be negative')
    .default(0.0),
});

export const addMoneySchema = z.object({
  amount: z
    .number({ required_error: 'Amount is required' })
    .positive('Amount must be strictly greater than 0')
    .max(1000000000, 'Amount cannot exceed 1,000,000,000')
    .refine((val) => Number(val.toFixed(2)) === val, {
      message: 'Amount cannot have more than 2 decimal places',
    }),
  description: z.string().max(255).optional(),
});

export const transferMoneySchema = z.object({
  receiverWalletId: z.string().min(1, 'Receiver wallet ID is required'),
  amount: z
    .number({ required_error: 'Amount is required' })
    .positive('Transfer amount must be strictly greater than 0')
    .max(1000000000, 'Transfer amount cannot exceed 1,000,000,000')
    .refine((val) => Number(val.toFixed(2)) === val, {
      message: 'Transfer amount cannot have more than 2 decimal places',
    }),
  description: z.string().max(255).optional(),
});

export const updateWalletStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'FROZEN'], {
    errorMap: () => ({ message: 'Status must be ACTIVE, INACTIVE, or FROZEN' }),
  }),
});

export const walletIdParamSchema = z.object({
  walletId: z.string().min(1, 'Wallet ID is required'),
});

export type CreateWalletDto = z.infer<typeof createWalletSchema>;
export type AddMoneyDto = z.infer<typeof addMoneySchema>;
export type TransferMoneyDto = z.infer<typeof transferMoneySchema>;
export type UpdateWalletStatusDto = z.infer<typeof updateWalletStatusSchema>;
