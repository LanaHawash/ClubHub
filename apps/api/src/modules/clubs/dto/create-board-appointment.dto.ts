import {
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateBoardAppointmentDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  position!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;
}