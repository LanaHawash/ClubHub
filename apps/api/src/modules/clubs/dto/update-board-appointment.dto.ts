import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateBoardAppointmentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) position?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
