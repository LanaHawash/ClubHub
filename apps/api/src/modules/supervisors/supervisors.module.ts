import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { SupervisorsController } from './supervisors.controller';
import { SupervisorsService } from './supervisors.service';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    JwtModule.register({}),
  ],
  controllers: [
    SupervisorsController,
  ],
  providers: [
    SupervisorsService,
  ],
  exports: [
    SupervisorsService,
  ],
})
export class SupervisorsModule {}