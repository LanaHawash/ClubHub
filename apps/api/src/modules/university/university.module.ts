import { Module } from '@nestjs/common';
import { UniversityController } from './university.controller';
import { UniversityService } from './university.service';
import { JwtModule } from '@nestjs/jwt';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UniversityController],
  providers: [
    UniversityService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class UniversityModule {}