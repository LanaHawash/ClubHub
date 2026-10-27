import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubsService } from './clubs.service';
import { ClubEligibilityService } from './club-eligibility.service';
import { CreateClubDto } from './dto/create-club.dto';
import { AssignSupervisorDto } from './dto/assign-supervisor.dto';
import { AssignClubAdminDto } from './dto/assign-club-admin.dto';
import { ClubAdminAssignmentsService } from './club-admin-assignments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccountRole } from '../../generated/prisma/client';

@Controller('clubs')
export class ClubsController {
  constructor(
    private readonly clubsService: ClubsService,
    private readonly clubAdminAssignmentsService: ClubAdminAssignmentsService,
    private readonly eligibilityService: ClubEligibilityService,
  ) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.clubsService.findAll(page, limit);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  findAllForDeanship(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.clubsService.findAllForDeanship(page, limit);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  create(@Body() dto: CreateClubDto, @Req() request: AuthenticatedRequest) {
    // Preserve the original one-argument call for legacy club-only creation.
    // Composite creation needs the authenticated actor for administrator grants.
    return dto.administrators?.length
      ? this.clubsService.create(dto, request.user.id)
      : this.clubsService.create(dto);
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  findOneForDeanship(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.findOneForDeanship(id);
  }

  @Get('my-admin-assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.STUDENT)
  getMyAdminAssignments(@Req() request: AuthenticatedRequest) {
    return this.clubAdminAssignmentsService.getMyAdminAssignments(request.user.id);
  }

  @Get(':id/admin/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.STUDENT)
  getClubAdminOverview(@Param('id', ParseUUIDPipe) clubId: string, @Req() request: AuthenticatedRequest) {
    return this.clubAdminAssignmentsService.getClubAdminOverview(clubId, request.user.id);
  }

  @Get(':id/admin-assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  getClubAdminAssignments(@Param('id', ParseUUIDPipe) clubId: string) {
    return this.clubAdminAssignmentsService.getClubAdminAssignments(clubId);
  }

  @Get(':id/eligibility/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.STUDENT)
  getMyEligibility(@Param('id', ParseUUIDPipe) clubId: string, @Req() request: AuthenticatedRequest) {
    return this.eligibilityService.evaluateForAccount(request.user.id, clubId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClubDto) {
    return this.clubsService.update(id, dto);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  archive(@Param('id', ParseUUIDPipe) id: string) { return this.clubsService.archive(id); }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  activate(@Param('id', ParseUUIDPipe) id: string) { return this.clubsService.activate(id); }

  @Patch(':id/supervisor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  assignSupervisor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignSupervisorDto) {
    return this.clubsService.assignSupervisor(id, dto.supervisorId);
  }

  @Post(':id/admin-assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  assignClubAdmin(@Param('id', ParseUUIDPipe) clubId: string, @Body() dto: AssignClubAdminDto, @Req() request: AuthenticatedRequest) {
    return this.clubAdminAssignmentsService.assignAdmin(clubId, dto, request.user.id);
  }

  @Patch(':id/admin-assignments/:assignmentId/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  revokeClubAdmin(@Param('id', ParseUUIDPipe) clubId: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Req() request: AuthenticatedRequest) {
    return this.clubAdminAssignmentsService.revokeAdmin(clubId, assignmentId, request.user.id);
  }
}
