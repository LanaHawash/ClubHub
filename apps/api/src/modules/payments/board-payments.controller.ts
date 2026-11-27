import {
  Controller,
  Get,
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
  BoardPaymentsService,
} from './board-payments.service';

@Controller('clubs/:clubId/board-nominations/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
export class BoardPaymentsController {
  constructor(
    private readonly boardPaymentsService:
      BoardPaymentsService,
  ) {}

  @Get('cash')
  getPendingCashPayments(
    @Param('clubId', ParseUUIDPipe)
    clubId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.boardPaymentsService.getPendingCashPayments(
      request.user.id,
      clubId,
    );
  }

  @Post(':paymentId/confirm-cash')
  confirmCashPayment(
    @Param('clubId', ParseUUIDPipe)
    clubId: string,

    @Param('paymentId', ParseUUIDPipe)
    paymentId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.boardPaymentsService.confirmCashPayment(
      request.user.id,
      clubId,
      paymentId,
    );
  }
}