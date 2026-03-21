import { NextRequest } from 'next/server';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export function parsePagination(req: NextRequest, defaultLimit = 50, maxLimit = 100): PaginationParams {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(url.searchParams.get('limit') || String(defaultLimit), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginatedResponse(data: any[], total: number, params: PaginationParams) {
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
      hasMore: params.offset + params.limit < total,
    },
  };
}

/**
 * Check whether the request includes explicit pagination params.
 * Returns true if either `page` or `limit` is present in the query string.
 */
export function hasPaginationParams(req: NextRequest): boolean {
  const url = new URL(req.url);
  return url.searchParams.has('page') || url.searchParams.has('limit');
}
