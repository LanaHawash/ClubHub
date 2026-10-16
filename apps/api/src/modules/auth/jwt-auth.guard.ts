import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../shared/prisma/prisma.service';

export type AuthenticatedUser = {
  id: string;
  role: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
  private readonly jwt: JwtService,
  private readonly config: ConfigService,
  private readonly prisma: PrismaService,
) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = authorization.slice(7);

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        role: string;
        purpose: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (
        payload.purpose !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.role !== 'string'
      ) {
        throw new UnauthorizedException('Invalid access token');
      }

      const account = await this.prisma.account.findUnique({
  where: { id: payload.sub },
  select: {
    id: true,
    role: true,
    status: true,
  },
});

if (!account || account.status !== 'ACTIVE') {
  throw new UnauthorizedException('Account unavailable');
}

request.user = {
  id: account.id,
  role: account.role,
};



      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
