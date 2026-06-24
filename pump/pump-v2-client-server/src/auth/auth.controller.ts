import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('/is-admin')
  async isAdmin(@Query('address') address) {
    return this.authService.isAdmin(address);
  }

  @Post('/login')
  async login(@Body() login: LoginDto) {
    return this.authService.login(login);
  }
}
