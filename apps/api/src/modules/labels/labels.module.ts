import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}