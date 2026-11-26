import {
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
  OnlinePaymentsService,
} from './online-payments.service';

@Controller()
export class OnlinePaymentsController {
  constructor(
    private readonly onlinePaymentsService:
      OnlinePaymentsService,
  ) {}

  @Post(
    'membership-applications/:id/payments/online',
  )
  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(AccountRole.STUDENT)
  initiateOnlinePayment(
    @Param('id', ParseUUIDPipe)
    applicationId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.onlinePaymentsService.initiateOnlinePayment(
      request.user.id,
      applicationId,
    );
  }
}