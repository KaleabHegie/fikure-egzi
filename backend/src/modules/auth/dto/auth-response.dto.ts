import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty() id: number;
  @ApiProperty() email: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ type: [String], example: ['SUPER_ADMIN'] }) roles: string[];
  @ApiProperty({ type: [String], example: ['members.read'] })
  permissions: string[];
  @ApiProperty({
    type: [Number],
    nullable: true,
    description: 'Departments the user may act in; null = all (office administrators)',
  })
  departmentIds: number[] | null;
}

export class AuthTokensDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({
    description: 'Access token lifetime in seconds',
    example: 900,
  })
  expiresIn: number;
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
}
