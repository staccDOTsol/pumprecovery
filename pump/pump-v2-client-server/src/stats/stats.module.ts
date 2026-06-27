import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { DatabaseModule } from 'src/database/database.module';
import { SolPriceModule } from 'src/sol-price/sol-price.module';

@Module({
  imports: [DatabaseModule, SolPriceModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
