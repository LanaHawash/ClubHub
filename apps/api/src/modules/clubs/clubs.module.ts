import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({}),
  ],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}