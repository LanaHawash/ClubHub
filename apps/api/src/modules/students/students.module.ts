import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    JwtModule.register({}),
  ],
  controllers: [
    StudentsController,
  ],
  providers: [
    StudentsService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class StudentsModule {}