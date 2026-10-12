import { IsString, Matches } from 'class-validator';

export class VerifyRegistrationDto {
  @IsString()
  @Matches(/^[0-9]+$/, {
    message: 'University ID must contain digits only',
  })
  universityId: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'Verification code must contain exactly 6 digits',
  })
  code: string;
}