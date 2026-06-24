import { Controller, Get } from '@nestjs/common';
import { SolPriceService } from './sol-price.service';

@Controller('sol-price')
export class SolPriceController {
  constructor(private solPriceService: SolPriceService) {}

  @Get()
  getPrice() {
    return this.solPriceService.getPrice();
  }
}
