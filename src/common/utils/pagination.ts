import { PaginationMeta } from './api-response';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export const parsePagination = (
  rawPage?: unknown,
  rawLimit?: unknown,
  defaultLimit = 10,
  maxLimit = 100
): PaginationParams => {
  let page = typeof rawPage === 'string' || typeof rawPage === 'number' ? parseInt(String(rawPage), 10) : 1;
  let limit = typeof rawLimit === 'string' || typeof rawLimit === 'number' ? parseInt(String(rawLimit), 10) : defaultLimit;

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPaginationMeta = (
  totalItems: number,
  page: number,
  limit: number
): PaginationMeta => {
  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};
