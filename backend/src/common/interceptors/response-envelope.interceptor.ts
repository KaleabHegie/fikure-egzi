import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Paginated } from '../pagination/paginated.js';

/**
 * Wraps every successful response:
 *   single resource → { data }
 *   list            → { data: items, meta }
 * Controllers just return the value; they never build envelopes by hand.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof StreamableFile) return value;
        if (value instanceof Paginated) return { data: value.items, meta: value.meta };
        if (value === undefined) return undefined;
        return { data: value };
      }),
    );
  }
}
