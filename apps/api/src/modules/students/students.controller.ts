import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import { StudentsService } from './students.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { AccountRole } from '../../generated/prisma/client';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
  ) {}

  @Get('me')
  @Roles(AccountRole.STUDENT)
  getMyProfile(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.studentsService.getMyProfile(
      request.user.id,
    );
  }

  @Get()
  @Roles(AccountRole.DEANSHIP)
  getAllStudents() {
    return this.studentsService.getAllStudents();
  }

  @Get(':id')
  @Roles(AccountRole.DEANSHIP)
  getStudentById(
    @Param('id', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getStudentById(
      studentId,
    );
  }
}