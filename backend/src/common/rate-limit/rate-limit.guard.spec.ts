import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppConfigService } from '../../config/app-config.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';

class TestController {
  handler() {}
}

function context(ip: string): ExecutionContext {
  return {
    getHandler: () => TestController.prototype.handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const config = { throttle: { limit: 2, ttlMs: 60_000 } } as AppConfigService;

  it('allows requests up to the limit, then rejects with 429', () => {
    const guard = new RateLimitGuard(new Reflector(), config);
    expect(guard.canActivate(context('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(context('1.1.1.1'))).toBe(true);
    expect(() => guard.canActivate(context('1.1.1.1'))).toThrow(HttpException);
  });

  it('tracks clients independently', () => {
    const guard = new RateLimitGuard(new Reflector(), config);
    guard.canActivate(context('1.1.1.1'));
    guard.canActivate(context('1.1.1.1'));
    expect(guard.canActivate(context('2.2.2.2'))).toBe(true);
  });
});
