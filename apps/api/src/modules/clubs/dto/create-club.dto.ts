import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ClubClassification } from '../../../generated/prisma/client';

export class CreateClubDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(ClubClassification)
  classification!: ClubClassification;

  @IsEmail()
  contactEmail!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2100)
  foundedYear?: number;

  @IsOptional()
  @IsString()
  meetingInfo?: string;

    @IsOptional()
    @IsUUID('4')
    facultyId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  eligibleMajorIds?: string[];
}