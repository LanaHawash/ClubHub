import { IsIn } from 'class-validator';

import type {
  ProviderPaymentOutcome,
} from '../providers/payment-provider.interface';

export class SimulatePaymentDto {
  @IsIn([
    'SUCCEEDED',
    'FAILED',
    'UNKNOWN',
  ])
  outcome!: ProviderPaymentOutcome;
}