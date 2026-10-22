import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { AssignSupervisorDto } from './dto/assign-supervisor.dto';
import { CreateClubAdminAccountDto } from './dto/create-club-admin-account.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { AccountRole } from '../../generated/prisma/client';

@Controller('clubs')
export class ClubsController {
  constructor(
    private readonly clubsService: ClubsService,
  ) {}

  // Public: list active clubs
 // Public: list active clubs with pagination
@Get()
findAll(
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  return this.clubsService.findAll(page, limit);
}

// Deanship only: list active and archived clubs.
@Get('admin/all')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
findAllForDeanship(
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  return this.clubsService.findAllForDeanship(page, limit);
}

  // Deanship only: create a club
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  create(@Body() dto: CreateClubDto) {
    return this.clubsService.create(dto);
  }

  // Deanship only: view active or archived club details.
@Get('admin/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
findOneForDeanship(
  @Param('id', ParseUUIDPipe) id: string,
) {
  return this.clubsService.findOneForDeanship(id);
}


// Sprint 3.5: Club administrators can retrieve their own club.
@Get('my-club')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.CLUB)
findMyClub(@Req() request: AuthenticatedRequest) {
  return this.clubsService.findMyClub(request.user.id);
}

  // Public: view an active club
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.findOne(id);
  }

  // Deanship only: update club information
@Put(':id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateClubDto,
) {
  return this.clubsService.update(id, dto);
}

// Sprint 3.3: Archive a club (Deanship only).
@Patch(':id/archive')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
archive(
  @Param('id', ParseUUIDPipe) id: string,
) {
  return this.clubsService.archive(id);
}

// Sprint 3.3: Reactivate a club (Deanship only).
@Patch(':id/activate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
activate(
  @Param('id', ParseUUIDPipe) id: string,
) {
  return this.clubsService.activate(id);
}


// Sprint 3.4: Assign or reassign a supervisor (Deanship only).
@Patch(':id/supervisor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
assignSupervisor(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: AssignSupervisorDto,
) {
  return this.clubsService.assignSupervisor(
    id,
    dto.supervisorId,
  );
}
// Sprint 3.5: Create a shared club admin account (Deanship only).
@Post(':id/admin-account')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
createAdminAccount(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: CreateClubAdminAccountDto,
) {
  return this.clubsService.createAdminAccount(id, dto);
}

}