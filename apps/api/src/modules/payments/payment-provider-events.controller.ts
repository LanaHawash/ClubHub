import {
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';

import {
  PaymentProviderEventsService,
} from './payment-provider-events.service';

import {
  ProviderPaymentEventDto,
} from './dto/provider-payment-event.dto';

@Controller('payments/provider-events')
export class PaymentProviderEventsController {
  constructor(
    private readonly eventsService:
      PaymentProviderEventsService,
  ) {}

  @Post('simulated')
  @HttpCode(200)
  processSimulatedEvent(
    @Body()
    dto: ProviderPaymentEventDto,
  ) {
    return this.eventsService.processSignedEvent({
      payload: dto.payload,

      signature: dto.signature,
    });
  }
}