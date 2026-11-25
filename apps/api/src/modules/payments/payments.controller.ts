import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  Get,
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
  PaymentsService,
} from './payments.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService:
      PaymentsService,
  ) {}

  @Post(
    'membership-applications/:id/payments/cash',
  )
  @Get('clubs/:clubId/admin/payments/cash')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.STUDENT)
  getPendingCashPayments(
    @Param('clubId', ParseUUIDPipe)
    clubId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.paymentsService.getPendingCashPayments(
      request.user.id,
      clubId,
    );
  }

@Post(
  'clubs/:clubId/admin/payments/:paymentId/confirm-cash',
)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.STUDENT)
confirmCashPayment(
  @Param('clubId', ParseUUIDPipe)
  clubId: string,

  @Param('paymentId', ParseUUIDPipe)
  paymentId: string,

  @Req()
  request: AuthenticatedRequest,
) {
  return this.paymentsService.confirmCashPayment(
    request.user.id,
    clubId,
    paymentId,
  );
}
  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(AccountRole.STUDENT)
  selectCashPayment(
    @Param('id', ParseUUIDPipe)
    applicationId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.paymentsService.selectCashPayment(
      request.user.id,
      applicationId,
    );
  }
}