import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { PaginationMeta } from '../../../common/pagination/paginated.js';
import { MembershipStatus } from '../../../generated/prisma/enums.js';
import { CreateMemberDto } from './create-member.dto.js';

class UserRefDto {
  @ApiProperty() id: number;
  @ApiProperty() fullName: string;
}

class ClassRefDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'MEZMUR' }) code: string;
  @ApiProperty({ example: 'Mezmur Class' }) nameEn: string;
  @ApiProperty({ example: 'የመዝሙር ክፍል' }) nameAm: string;
}

class GradeRefDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'GEEZ' }) code: string;
  @ApiProperty({ example: "Ge'ez" }) nameEn: string;
  @ApiProperty({ example: 'ግዕዝ' }) nameAm: string;
  @ApiPropertyOptional({ example: 'ሐ', nullable: true }) shortLabel: string | null;
  @ApiProperty() isActive: boolean;
}

class MemberClassDto {
  @ApiProperty({ type: ClassRefDto }) classType: ClassRefDto;
  @ApiProperty({ type: GradeRefDto }) classGrade: GradeRefDto;
  @ApiProperty() assignedAt: string;
}

class DepartmentRefDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'EDUCATION' }) code: string;
  @ApiProperty() nameEn: string;
  @ApiProperty() nameAm: string;
  @ApiProperty() isActive: boolean;
}

class MemberDepartmentDto {
  @ApiProperty({ description: 'Membership id' }) id: number;
  @ApiProperty({ enum: ['HEAD', 'DEPUTY', 'SECRETARY', 'MEMBER'] }) role: string;
  @ApiProperty() joinedAt: string;
  @ApiProperty({ type: DepartmentRefDto }) department: DepartmentRefDto;
}

export class MemberDto extends OmitType(CreateMemberDto, ['status', 'classGradeIds'] as const) {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'FE-00042' }) memberCode: string;
  @ApiProperty({ enum: MembershipStatus }) status: MembershipStatus;
  @ApiProperty({ description: 'Fetch it from GET /members/:id/photo' }) hasPhoto: boolean;
  @ApiProperty({ type: [MemberClassDto] }) classes: MemberClassDto[];
  @ApiProperty({ type: [MemberDepartmentDto] }) departments: MemberDepartmentDto[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  createdBy: UserRefDto | null;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  updatedBy: UserRefDto | null;
}

export class MemberEnvelopeDto {
  @ApiProperty({ type: MemberDto }) data: MemberDto;
}

export class MemberListEnvelopeDto {
  @ApiProperty({ type: [MemberDto] }) data: MemberDto[];
  @ApiProperty({ type: PaginationMeta }) meta: PaginationMeta;
}

class CountByKeyDto {
  @ApiProperty() key: string;
  @ApiProperty() count: number;
}

class CountByDateDto {
  @ApiProperty({ example: '2026-09-11' }) date: string;
  @ApiProperty() count: number;
}

export class MemberStatsDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: [CountByKeyDto] }) byStatus: CountByKeyDto[];
  @ApiProperty({ type: [CountByKeyDto] }) byGender: CountByKeyDto[];
  @ApiProperty() servingInDepartments: number;
  @ApiProperty() placedInClasses: number;
  @ApiProperty({ type: [CountByDateDto], description: 'Members by join date, last ~13 months' })
  joinedByDay: CountByDateDto[];
}

export class MemberStatsEnvelopeDto {
  @ApiProperty({ type: MemberStatsDto }) data: MemberStatsDto;
}
