import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';

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
  @Get()
  findAll() {
    return this.clubsService.findAll();
  }

  // Deanship only: create a club
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  create(@Body() dto: CreateClubDto) {
    return this.clubsService.create(dto);
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

}