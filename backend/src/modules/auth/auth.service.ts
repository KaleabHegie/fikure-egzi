import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import type { AuthenticatedUser, JwtPayload } from '../../common/types/authenticated-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthTokensDto } from './dto/auth-response.dto.js';
import type { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto.js';
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

  // ── Own profile ──────────────────────────────────────────────────────────

  /** The signed-in user's own account details (profile page). */
  async profile(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
        departments: {
          select: { department: { select: { id: true, nameEn: true, nameAm: true } } },
          orderBy: { department: { sortOrder: 'asc' } },
        },
        member: {
          select: {
            id: true,
            memberCode: true,
            firstName: true,
            fatherName: true,
            grandfatherName: true,
          },
        },
      },
    });
    const { roles, departments, ...rest } = user;
    return {
      ...rest,
      role: roles[0]?.role ?? null,
      departments: departments.map((d) => d.department),
    };
  }

  /** Name, phone and email of one's own account; a new email needs the current password. */
  async updateProfile(userId: number, dto: UpdateProfileDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    const emailChanges = dto.email !== undefined && dto.email !== user.email;
    if (emailChanges) {
      await this.assertPassword(dto.currentPassword, user.passwordHash);
      if (await this.prisma.user.count({ where: { email: dto.email } })) {
        throw new ConflictException({
          message: 'A user with this email already exists.',
          code: 'emailTaken',
        });
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(emailChanges && { email: dto.email }),
      },
    });
    const fields = Object.keys(dto).filter((k) => k !== 'currentPassword');
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      changes: { fields, ownProfile: true },
      ipAddress: meta.ipAddress,
    });
    return this.profile(userId);
  }

  /**
   * Changes one's own password. Other devices are signed out; this one stays
   * signed in when it passes its refresh token.
   */
  async changePassword(userId: number, dto: ChangePasswordDto, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    await this.assertPassword(dto.currentPassword, user.passwordHash);
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new ValidationFailedException([
        { field: 'newPassword', messages: ['profile.samePassword'] },
      ]);
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, this.config.auth.bcryptRounds);
    const keep = dto.refreshToken ? hashToken(dto.refreshToken) : null;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, ...(keep && { tokenHash: { not: keep } }) },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      changes: { passwordChanged: true, ownProfile: true },
      ipAddress: meta.ipAddress,
    });
  }

  private async assertPassword(password: string | undefined, hash: string): Promise<void> {
    if (!password || !(await bcrypt.compare(password, hash))) {
      throw new ValidationFailedException([
        { field: 'currentPassword', messages: ['profile.wrongPassword'] },
      ]);
    }
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
