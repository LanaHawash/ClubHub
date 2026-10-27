import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ArrayMaxSize, ArrayUnique, Matches, ValidateNested } from 'class-validator';
import { ClubClassification, ClubAdminPosition } from '../../../generated/prisma/client';

export class InitialBoardMemberDto {
  @IsUUID('4') studentId!: string;
  @IsString() @MinLength(1) @MaxLength(100) position!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
}
export class InitialClubAdminDto {
  @IsInt() @Min(0) boardIndex!: number;
  @IsEnum(ClubAdminPosition) position!: ClubAdminPosition;
}
export class CreateClubDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsString() @MinLength(1) description!: string;
  @IsEnum(ClubClassification) classification!: ClubClassification;
  @IsEmail() contactEmail!: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsInt() @Min(1800) @Max(2100) foundedYear?: number;
  @IsOptional() @IsString() meetingInfo?: string;
  @IsOptional() @IsUUID('4') facultyId?: string | null;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) eligibleMajorIds?: string[];
  @IsOptional() @IsUUID('4') supervisorId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) labelIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(80, { each: true })
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}\s&+.'/-]*$/u, { each: true }) newLabels?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => InitialBoardMemberDto)
  boardMembers?: InitialBoardMemberDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(2) @ValidateNested({ each: true }) @Type(() => InitialClubAdminDto)
  administrators?: InitialClubAdminDto[];
}
