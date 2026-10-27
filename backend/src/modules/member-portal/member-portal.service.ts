import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { normalizeEthiopianPhone } from '../../common/transforms/string.transforms.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { normalizeMemberCode } from '../attendance/attendance-math.js';
import { AuditService } from '../audit/audit.service.js';
import { MembersService } from '../members/members.service.js';

/** How long a member stays signed in to their page. */
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

export interface MemberPortalPayload {
  sub: number;
  typ: 'member';
}

/**
 * Members looking at their own record: they sign in with their member ID
 * (typed or from their QR code) plus the phone number on file, and get a
 * short-lived token that only this module accepts — it is signed with a
 * different secret, so it can never pass as a staff token.
 */
@Injectable()
export class MemberPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly members: MembersService,
    private readonly attendanceService: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  /** Separate from the staff signing key. */
  get secret(): string {
    return `${this.config.auth.accessSecret}:member-portal`;
  }

  async login(code: string, phone: string, ipAddress: string | null) {
    const memberCode = normalizeMemberCode(code);
    const wanted = normalizeEthiopianPhone(phone);
    const member = await this.prisma.member.findFirst({
      where: { memberCode, deletedAt: null },
      select: { id: true, phone: true, alternatePhone: true },
    });
    const phones = [member?.phone, member?.alternatePhone]
      .filter((p): p is string => Boolean(p))
      .map(normalizeEthiopianPhone);
    // One message for every failure, so the page never reveals which IDs exist.
    if (!member || !wanted || !phones.includes(wanted)) {
      throw new UnauthorizedException('The member ID and phone number do not match.');
    }
    const payload: MemberPortalPayload = { sub: member.id, typ: 'member' };
    const token = await this.jwt.signAsync(payload, {
      secret: this.secret,
      expiresIn: TOKEN_TTL_SECONDS,
    });
    await this.audit.record({
      userId: null,
      action: 'LOGIN',
      entity: 'MemberPortal',
      entityId: member.id,
      ipAddress,
    });
    return { token, expiresIn: TOKEN_TTL_SECONDS };
  }

  async verify(token: string): Promise<number> {
    const payload = await this.jwt
      .verifyAsync<MemberPortalPayload>(token, { secret: this.secret, algorithms: ['HS256'] })
      .catch(() => null);
    if (payload?.typ !== 'member' || !Number.isInteger(payload.sub)) {
      throw new UnauthorizedException('Please sign in again.');
    }
    return payload.sub;
  }

  /** The member's own record — without staff-only details (internal notes, who edited it). */
  async me(memberId: number) {
    const {
      notes: _notes,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      ...member
    } = await this.members.findOne(memberId);
    const groups = await this.prisma.serviceGroupMember.findMany({
      where: { memberId },
      select: {
        term: { select: { id: true, nameEn: true, nameAm: true, isCurrent: true } },
        group: { select: { id: true, nameEn: true, nameAm: true } },
      },
      orderBy: { term: { startsOn: 'desc' } },
    });
    return { ...member, serviceGroups: groups };
  }

  attendance(memberId: number, from?: string, to?: string) {
    return this.attendanceService.memberSummary(memberId, null, from, to);
  }

  photo(memberId: number) {
    return this.members.openPhoto(memberId);
  }
}
