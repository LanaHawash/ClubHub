import { IsString, MinLength, MaxLength } from 'class-validator';

export class CompleteRegistrationDto {
  @IsString()
  registrationToken: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}