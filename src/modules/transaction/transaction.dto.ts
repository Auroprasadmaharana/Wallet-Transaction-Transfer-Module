import { z } from 'zod';

export const transactionFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  category: z.enum(['DEPOSIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL']).optional(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).optional(),
  fromDate: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'fromDate must be a valid ISO date string (e.g. 2026-01-01)',
    })
    .optional(),
  toDate: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'toDate must be a valid ISO date string (e.g. 2026-12-31)',
    })
    .optional(),
  sortBy: z.enum(['createdAt', 'amount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const transactionIdParamSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
});

export type TransactionFilterDto = z.infer<typeof transactionFilterSchema>;
