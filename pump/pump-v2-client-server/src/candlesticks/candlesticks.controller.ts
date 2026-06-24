import { Controller, Get, Param } from '@nestjs/common';
import { CandlesticksService } from './candlesticks.service';

@Controller('candlesticks')
export class CandlesticksController {
  constructor(private candlesticksService: CandlesticksService) {}

  @Get(':mint')
  getAll(@Param('mint') mint: string) {
    return this.candlesticksService.getAll(mint);
  }
}
