import { Module } from '@nestjs/common';
import { MemberImportController } from './import/member-import.controller.js';
import { MemberImportService } from './import/member-import.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  controllers: [MemberImportController, MembersController],
  providers: [MembersService, MemberImportService],
  exports: [MembersService],
})
export class MembersModule {}
