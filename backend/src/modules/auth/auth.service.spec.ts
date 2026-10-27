import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { AuthService, hashToken, ROTATION_GRACE_MS } from './auth.service.js';

// Untyped async mock: tests feed it partial Prisma payloads.
const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const meta = { ipAddress: '127.0.0.1', userAgent: 'jest' };

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: asyncMock(), update: asyncMock() },
    refreshToken: {
      findUnique: asyncMock(),
      create: asyncMock(),
      update: asyncMock(),
      updateMany: asyncMock(),
    },
  };
  const config = {
    auth: {
      accessSecret: 'x'.repeat(32),
      accessTtlSeconds: 900,
      refreshTtlDays: 7,
      bcryptRounds: 4,
    },
  } as unknown as AppConfigService;
  const audit = { record: asyncMock() };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    new JwtService({ secret: 'x'.repeat(32) }),
    config,
    audit as unknown as AuditService,
  );

  let user: Record<string, unknown>;
  beforeAll(async () => {
    user = {
      id: 1,
      email: 'admin@example.com',
      fullName: 'Admin',
      isActive: true,
      passwordHash: await bcrypt.hash('correct-password', 4),
      roles: [
        {
          role: {
            code: 'VIEWER',
            permissions: [{ permission: { code: 'members.read' } }],
          },
        },
      ],
    };
  });
  beforeEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('issues tokens and resolves permissions for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login('admin@example.com', 'correct-password', meta);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.expiresIn).toBe(900);
      expect(result.user.permissions).toEqual(['members.read']);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: hashToken(result.refreshToken),
          }),
        }),
      );
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.login('admin@example.com', 'nope', meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown email with the same error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('ghost@example.com', 'x', meta)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('rejects inactive users', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
      await expect(
        service.login('admin@example.com', 'correct-password', meta),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const token = (overrides: Record<string, unknown> = {}) => ({
      id: 5,
      userId: 1,
      revokedAt: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
      ...overrides,
    });

    it('rotates a valid refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(token());

      const result = await service.refresh('a'.repeat(64), meta);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { rotatedAt: expect.any(Date) },
      });
      expect(result.refreshToken).not.toBe('a'.repeat(64));
    });

    it('still honours a token rotated moments ago (second tab, interrupted reload)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        token({ rotatedAt: new Date(Date.now() - 5_000) }),
      );

      await expect(service.refresh('a'.repeat(64), meta)).resolves.toHaveProperty('accessToken');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a logged-out token without revoking other sessions', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(token({ revokedAt: new Date() }));

      await expect(service.refresh('a'.repeat(64), meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes every session when an old rotated token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        token({ rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1_000) }),
      );

      await expect(service.refresh('a'.repeat(64), meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects expired tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        token({ expiresAt: new Date(Date.now() - 1) }),
      );
      await expect(service.refresh('a'.repeat(64), meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
