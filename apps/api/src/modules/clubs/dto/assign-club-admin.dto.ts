import { IsEnum, IsUUID } from 'class-validator';
import { ClubAdminPosition } from '../../../generated/prisma/client';

export class AssignClubAdminDto {
  @IsUUID()
  boardAppointmentId!: string;

  @IsEnum(ClubAdminPosition)
  position!: ClubAdminPosition;
}