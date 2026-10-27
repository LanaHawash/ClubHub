import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateBoardAppointmentDto {
  @IsUUID() studentId!: string;
  @IsString() @MinLength(2) @MaxLength(100) position!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
}
