import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AccountRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BoardAppointmentsService } from './board-appointments.service';
import { CreateBoardAppointmentDto } from './dto/create-board-appointment.dto';
import { UpdateBoardAppointmentDto } from './dto/update-board-appointment.dto';
import { EndBoardAppointmentDto } from './dto/end-board-appointment.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
export class BoardAppointmentsController {
  constructor(private readonly boards: BoardAppointmentsService) {}
  @Get('clubs/:id/board') current(@Param('id', ParseUUIDPipe) id: string) { return this.boards.current(id); }
  @Get('clubs/:id/board/history') history(@Param('id', ParseUUIDPipe) id: string) { return this.boards.history(id); }
  @Post('clubs/:id/board') create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBoardAppointmentDto) { return this.boards.create(id, dto); }
  @Put('board-appointments/:id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBoardAppointmentDto) { return this.boards.update(id, dto); }
  @Patch('board-appointments/:id/end') end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndBoardAppointmentDto, @Req() req: AuthenticatedRequest) { return this.boards.end(id, dto.endDate, req.user.id); }
}
