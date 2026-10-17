import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { StartRegistrationDto } from './dto/start-registration.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';
//import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const REFRESH_COOKIE = 'clubhub_refresh';

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function readRefreshCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REFRESH_COOKIE}=`));

  return cookie
    ? decodeURIComponent(cookie.slice(REFRESH_COOKIE.length + 1))
    : undefined;
}
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


@Get('me')
@UseGuards(JwtAuthGuard)
getCurrentUser(@Req() request: AuthenticatedRequest) {
  return this.authService.getCurrentUser(request.user.id);
}


@Post('login')
async login(
  @Body() dto: LoginDto,
  @Res({ passthrough: true }) response: Response,
) {
  const result = await this.authService.login(
    dto.email,
    dto.password,
  );

  response.cookie(
    REFRESH_COOKIE,
    result.refreshToken,
    refreshCookieOptions,
  );

  const { refreshToken, ...publicResult } = result;
  return publicResult;
}

@Post('refresh-token')
async refreshToken(
  @Req() request: Request,
  @Res({ passthrough: true }) response: Response,
) {
  const refreshToken = readRefreshCookie(request);

  if (!refreshToken) {
    throw new UnauthorizedException('Refresh token required');
  }

  const result = await this.authService.refreshToken(refreshToken);

  response.cookie(
    REFRESH_COOKIE,
    result.refreshToken,
    refreshCookieOptions,
  );

  const { refreshToken: rotatedToken, ...publicResult } = result;
  return publicResult;
}

@Post('logout')
async logout(
  @Req() request: Request,
  @Res({ passthrough: true }) response: Response,
) {
  const refreshToken = readRefreshCookie(request);

  if (refreshToken) {
    await this.authService.logout(refreshToken);
  }

  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: refreshCookieOptions.httpOnly,
    secure: refreshCookieOptions.secure,
    sameSite: refreshCookieOptions.sameSite,
    path: refreshCookieOptions.path,
  });

  return { message: 'Logged out successfully' };
}

@Post('forgot-password')
forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.authService.forgotPassword(dto.email);
}
@Post('reset-password')
resetPassword(@Body() dto: ResetPasswordDto) {
  return this.authService.resetPassword(
    dto.token,
    dto.newPassword,
  );
}

@Post('change-password')
@UseGuards(JwtAuthGuard)
changePassword(
  @Req() request: AuthenticatedRequest,
  @Body() dto: ChangePasswordDto,
) {
  return this.authService.changePassword(
    request.user.id,
    dto.currentPassword,
    dto.newPassword,
  );
}

}

