import { IsEnum, IsISO8601, IsInt, Min } from 'class-validator';

import { MembershipRegistrationMode } from '../../../generated/prisma/client';

export class UpdateMembershipModeDto {
  @IsEnum(MembershipRegistrationMode)
  registrationMode!: MembershipRegistrationMode;

  @IsInt()
  @Min(1)
  configVersion!: number;
}

export class RegistrationWindowDatesDto {
  @IsISO8601({ strict: true })
  opensAt!: string;

  @IsISO8601({ strict: true })
  closesAt!: string;
}
export class ExtendRegistrationWindowDto {
  @IsISO8601({ strict: true })
  closesAt!: string;
}
