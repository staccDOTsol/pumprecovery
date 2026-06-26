import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';

@Injectable()
export class SolProviderService {
  connection: Connection;
  dedicatedConnection: Connection;

  constructor(private readonly configService: ConfigService) {
    this.connection = new Connection(this.configService.get('solanaRpcUrl'));
    this.dedicatedConnection = new Connection(
      this.configService.get('dedicatedSolanaRpcUrl'),
    );
  }
}
