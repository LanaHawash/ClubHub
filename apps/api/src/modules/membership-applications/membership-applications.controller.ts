import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AccountRole } from '../../generated/prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { MembershipApplicationsService } from './membership-applications.service';

@Controller('clubs')
export class MembershipApplicationsController {
  constructor(
    private readonly applicationsService:
      MembershipApplicationsService,
  ) {}

  @Post(':id/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.STUDENT)
  createApplication(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.applicationsService.createOrdinaryApplication(
      request.user.id,
      clubId,
    );
  }
}