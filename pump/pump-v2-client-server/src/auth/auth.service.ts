import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { sign } from 'tweetnacl';
import * as bs58 from 'bs58';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly databaseService: DatabaseService,
  ) {}

  async login(login: LoginDto) {
    const { signature, timestamp, address } = login;

    // if (timestamp > Date.now() || timestamp < Date.now() - 120 * 1000) {
    //   throw new UnauthorizedException('Invalid timestamp');
    // }

    const message = `Sign in to stacc.art: ${timestamp}`;
    const verified = sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      bs58.decode(address),
    );

    if (!verified) throw new UnauthorizedException('Invalid signature');

    return {
      access_token: this.jwtService.sign({ address }),
    };
  }

  async isAdmin(address: string) {
    return this.databaseService.isAdmin(address);
  }
}
