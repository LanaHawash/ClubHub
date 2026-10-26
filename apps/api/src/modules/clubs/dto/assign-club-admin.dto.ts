import { IsEnum, IsUUID } from 'class-validator';
import { ClubAdminPosition } from '../../../generated/prisma/client';

export class AssignClubAdminDto {
  @IsUUID()
  accountId!: string;

  @IsEnum(ClubAdminPosition)
  position!: ClubAdminPosition;
}