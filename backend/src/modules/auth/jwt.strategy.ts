import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtPayload } from '../../common/types/authenticated-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAuthenticatedUser, USER_WITH_ACCESS } from './user-principal.js';

/**
 * Validates the bearer token, then reloads the user's roles and permissions
 * from the database on every request — so deactivating a user or revoking a
 * permission takes effect immediately, not when the token expires.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.accessSecret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: USER_WITH_ACCESS,
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or no longer exists');
    }
    return toAuthenticatedUser(user);
  }
}
