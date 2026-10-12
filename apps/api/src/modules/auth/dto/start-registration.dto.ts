import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class StartRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/, {
    message: 'University ID must contain digits only',
  })
  universityId: string;
}