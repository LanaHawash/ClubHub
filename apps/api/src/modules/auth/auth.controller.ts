import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { StartRegistrationDto } from './dto/start-registration.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { LoginDto } from './dto/login.dto';
import { Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registration/start')
  startRegistration(@Body() dto: StartRegistrationDto) {
    return this.authService.startRegistration(dto.universityId);
  }

  @Post('registration/verify')
verifyRegistration(@Body() dto: VerifyRegistrationDto) {
  return this.authService.verifyRegistration(
    dto.universityId,
    dto.code,
  );

}

@Post('registration/complete')
completeRegistration(@Body() dto: CompleteRegistrationDto) {
  return this.authService.completeRegistration(
    dto.registrationToken,
    dto.password,
  );
}
@Post('login')
login(@Body() dto: LoginDto) {
  return this.authService.login(dto.email, dto.password);
}

@Get('me')
@UseGuards(JwtAuthGuard)
getCurrentUser(@Req() request: AuthenticatedRequest) {
  return this.authService.getCurrentUser(request.user.id);
}

@Post('refresh-token')
refreshToken(@Body() dto: RefreshTokenDto) {
  return this.authService.refreshToken(dto.refreshToken);
}

@Post('logout')
logout(@Body() dto: RefreshTokenDto) {
  return this.authService.logout(dto.refreshToken);
}
}

