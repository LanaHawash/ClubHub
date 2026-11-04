import { Matches } from 'class-validator';

export class InitializeMembershipDto {
  @Matches(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/)
  firstTimeFee!: string;

  @Matches(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/)
  renewalFee!: string;
}
