import { PartialType } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto.js';

export class UpdateMemberDto extends PartialType(CreateMemberDto) {}
