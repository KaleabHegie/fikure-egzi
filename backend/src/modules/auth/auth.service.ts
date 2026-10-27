import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import type { AuthenticatedUser, JwtPayload } from '../../common/types/authenticated-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthTokensDto } from './dto/auth-response.dto.js';
import { toAuthenticatedUser, USER_WITH_ACCESS } from './user-principal.js';

const INVALID_CREDENTIALS = 'Invalid email or password';
const INVALID_SESSION = 'Session expired. Please sign in again.';

/** How long a rotated refresh token is still accepted (concurrent tabs, interrupted reloads). */
export const ROTATION_GRACE_MS = 60_000;

// Compared against when the email is unknown, so response time does not
// reveal whether an account exists.
const DUMMY_HASH = '$2b$12$5aUv7rIip.UFe.9BojgiZ.kETkVE0nSfdi7s5d8qNvTaZ1eV.83w2';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta): Promise<AuthTokensDto> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: USER_WITH_ACCESS,
    });
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
    });

    return this.issueTokens(toAuthenticatedUser(user), meta);
  }

  /**
   * Rotates the refresh token.
   *
   * A token already exchanged within the last ROTATION_GRACE_MS is still
   * honoured: that is two tabs refreshing at once, or a page reload that
   * dropped the response. An older rotated token, or a revoked one, means it
   * was stolen or replayed, so every session for that user is revoked.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensDto> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { include: USER_WITH_ACCESS } },
    });

    if (!stored) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    if (stored.revokedAt) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    const now = Date.now();
    if (stored.rotatedAt && now - stored.rotatedAt.getTime() > ROTATION_GRACE_MS) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking all sessions`,
      );
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    if (stored.expiresAt.getTime() <= now || !stored.user.isActive) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    if (!stored.rotatedAt) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { rotatedAt: new Date(now) },
      });
    }
    return this.issueTokens(toAuthenticatedUser(stored.user), meta);
  }

  async logout(refreshToken: string, user: AuthenticatedUser, meta: RequestMeta): Promise<void> {
    const now = new Date();
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        OR: [
          { tokenHash: hashToken(refreshToken) },
          // Close the grace window too, so a just-rotated token can't outlive logout.
          { rotatedAt: { gte: new Date(now.getTime() - ROTATION_GRACE_MS) } },
        ],
      },
      data: { revokedAt: now },
    });
    await this.audit.record({
      userId: user.id,
      action: 'LOGOUT',
      entity: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
    });
  }

  private async revokeAllForUser(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: AuthenticatedUser, meta: RequestMeta): Promise<AuthTokensDto> {
    const { accessTtlSeconds, refreshTtlDays } = this.config.auth;
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: accessTtlSeconds,
    });
    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlDays * 86_400_000),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtlSeconds, user };
  }
}
