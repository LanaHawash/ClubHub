import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}