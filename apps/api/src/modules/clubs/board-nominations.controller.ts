import {
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
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
  BoardNominationsService,
} from './board-nominations.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BoardNominationsController {
  constructor(
    private readonly nominationsService:
      BoardNominationsService,
  ) {}

  @Get('students/me/board-nominations')
  @Roles(AccountRole.STUDENT)
  findMyNominations(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.nominationsService.findMyNominations(
      request.user.id,
    );
  }

  @Get('clubs/:clubId/board-nominations')
  @Roles(AccountRole.DEANSHIP)
  findAllForClub(
    @Param('clubId', ParseUUIDPipe)
    clubId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.nominationsService.findAllForClub(
      request.user.id,

      clubId,
    );
  }

  @Patch(
    'clubs/:clubId/board-nominations/:nominationId/withdraw',
  )
  @Roles(AccountRole.DEANSHIP)
  withdraw(
    @Param('clubId', ParseUUIDPipe)
    clubId: string,

    @Param('nominationId', ParseUUIDPipe)
    nominationId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.nominationsService.withdraw(
      request.user.id,

      clubId,

      nominationId,
    );
  }
}