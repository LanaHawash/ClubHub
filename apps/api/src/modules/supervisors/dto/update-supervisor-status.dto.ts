import { IsEnum } from 'class-validator';
import { AccountStatus } from '../../../generated/prisma/client';

export class UpdateSupervisorStatusDto {
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}