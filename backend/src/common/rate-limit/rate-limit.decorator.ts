import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Max requests per window, per client IP, per route. */
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'rateLimit';
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/** Overrides the global limit for a route or controller (e.g. stricter on login). */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
