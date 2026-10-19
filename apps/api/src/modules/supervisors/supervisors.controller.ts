import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { SupervisorsService } from './supervisors.service';

import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { UpdateSupervisorDto } from './dto/update-supervisor.dto';
import { UpdateSupervisorStatusDto } from './dto/update-supervisor-status.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { AccountRole } from '../../generated/prisma/client';

@Controller('supervisors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.DEANSHIP)
export class SupervisorsController {
  constructor(
    private readonly supervisorsService: SupervisorsService,
  ) {}

  // Create a supervisor
  @Post()
  create(@Body() dto: CreateSupervisorDto) {
    return this.supervisorsService.create(dto);
  }

  // List all supervisors
  @Get()
  findAll() {
    return this.supervisorsService.findAll();
  }

  // Update supervisor information
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupervisorDto,
  ) {
    return this.supervisorsService.update(id, dto);
  }

  // Activate or deactivate a supervisor
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupervisorStatusDto,
  ) {
    return this.supervisorsService.updateStatus(
      id,
      dto.status,
    );
  }
}