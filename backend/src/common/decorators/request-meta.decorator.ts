import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Client IP + user agent, for audit logs and session records. */
export const ReqMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMeta => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    };
  },
);
