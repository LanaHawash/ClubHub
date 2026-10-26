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
  ArrayMaxSize,
  ArrayUnique,
  Matches,
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

  @IsOptional()
  @IsUUID('4')
  supervisorId?: string | null;
    // Sprint 3.6: Existing reusable labels selected in the form.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  labelIds?: string[];

  // Sprint 3.6: New labels pending until the club is saved.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(80, { each: true })
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}\s&+.'/-]*$/u, {
    each: true,
    message: 'New label contains unsupported characters.',
  })
  newLabels?: string[];
}