import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccountRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Controller('api/labels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  findAll() {
    return this.labelsService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  create(@Body() dto: CreateLabelDto) {
    return this.labelsService.create(dto.name);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelsService.update(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.labelsService.remove(id);
  }
}