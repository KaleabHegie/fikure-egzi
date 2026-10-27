import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
  SKIP_RATE_LIMIT_KEY,
} from './rate-limit.decorator.js';

interface Window {
  count: number;
  resetAt: number;
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Fixed-window, in-memory rate limiter keyed by client IP + route.
 *
 * cPanel runs the API as a single Passenger process, so process memory is the
 * right store. If the API is ever scaled horizontally, swap the Map for Redis.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  private lastSweep = Date.now();

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)) {
      return true;
    }

    const { limit, windowMs } = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      targets,
    ) ?? {
      limit: this.config.throttle.limit,
      windowMs: this.config.throttle.ttlMs,
    };

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const now = Date.now();
    this.sweep(now);

    const key = `${req.ip ?? 'unknown'}:${context.getClass().name}.${context.getHandler().name}`;
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - window.count));

    if (window.count > limit) {
      res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      throw new HttpException(
        'Too many requests. Please try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
