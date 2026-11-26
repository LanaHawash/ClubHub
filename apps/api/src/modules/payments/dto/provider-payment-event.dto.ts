import {
  IsString,
  Matches,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

export class ProviderPaymentEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  payload!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  signature!: string;
}