import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Paginated } from '../pagination/paginated.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

const run = (value: unknown) =>
  lastValueFrom(
    new ResponseEnvelopeInterceptor().intercept(
      {} as ExecutionContext,
      {
        handle: () => of(value),
      } as CallHandler,
    ),
  );

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps a single value in { data }', async () => {
    await expect(run({ id: 1 })).resolves.toEqual({ data: { id: 1 } });
  });

  it('wraps paginated results in { data, meta }', async () => {
    await expect(run(Paginated.of([{ id: 1 }], 41, 2, 20))).resolves.toEqual({
      data: [{ id: 1 }],
      meta: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
  });

  it('leaves empty (204) responses empty', async () => {
    await expect(run(undefined)).resolves.toBeUndefined();
  });
});
