import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DeliveryModule {}
