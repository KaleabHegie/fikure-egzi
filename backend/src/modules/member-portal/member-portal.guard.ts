import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { MemberPortalService } from './member-portal.service.js';

export type PortalRequest = Request & { portalMemberId?: number };

/** Accepts only member-portal tokens (never staff ones) and remembers whose page it is. */
@Injectable()
export class MemberPortalGuard implements CanActivate {
  constructor(private readonly portal: MemberPortalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PortalRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Please sign in.');
    req.portalMemberId = await this.portal.verify(token);
    return true;
  }
}
