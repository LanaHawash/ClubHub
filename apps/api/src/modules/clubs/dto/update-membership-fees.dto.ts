import { IsInt, Matches, Min } from 'class-validator';

export class UpdateMembershipFeesDto {
  @Matches(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/)
  firstTimeFee!: string;

  @Matches(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/)
  renewalFee!: string;

  @IsInt()
  @Min(1)
  configVersion!: number;
}