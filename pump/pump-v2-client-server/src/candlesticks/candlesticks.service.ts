import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class CandlesticksService {
  constructor(private databaseService: DatabaseService) {}

  async getAll(mint: string) {
    return this.databaseService.getCandlesticks(mint);
  }
}
