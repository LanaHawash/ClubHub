import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  AccountRole,
} from '../../generated/prisma/client';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import type {
  AuthenticatedRequest,
} from '../auth/jwt-auth.guard';

import {
  RolesGuard,
} from '../auth/roles.guard';

import {
  Roles,
} from '../auth/roles.decorator';

import {
  PaymentSimulationService,
} from './payment-simulation.service';

import {
  SimulatePaymentDto,
} from './dto/simulate-payment.dto';

@Controller('payments/simulation')
export class PaymentSimulationController {
  constructor(
    private readonly simulationService:
      PaymentSimulationService,
  ) {}

  @Post('attempts/:attemptId/outcome')
  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(AccountRole.DEANSHIP)
  simulateOutcome(
    @Param('attemptId', ParseUUIDPipe)
    attemptId: string,

    @Body()
    dto: SimulatePaymentDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.simulationService.simulateOutcome(
      request.user.id,
      attemptId,
      dto.outcome,
    );
  }
}