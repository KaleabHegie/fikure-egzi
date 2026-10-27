import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 2000 })
  total: number;

  @ApiProperty({ example: 100 })
  totalPages: number;
}

/**
 * Returned by services for list endpoints. The response interceptor turns it
 * into `{ data: items, meta }` so every list response has the same shape.
 */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta,
  ) {}

  static of<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
    return new Paginated(items, {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }
}
