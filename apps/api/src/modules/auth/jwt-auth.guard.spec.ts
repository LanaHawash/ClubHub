import { jest } from '@jest/globals';
import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('JwtAuthGuard - Sprint 2', () => {
  let guard: JwtAuthGuard;

  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const configMock = {
    getOrThrow: jest.fn().mockReturnValue(
      'test-access-secret' as never,
    ),
  };

  const prismaMock = {
    account: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    guard = new JwtAuthGuard(
      jwtMock as unknown as JwtService,
      configMock as unknown as ConfigService,
      prismaMock as unknown as PrismaService,
    );
  });

  function createContext(token = 'test-access-token') {
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
      user: undefined as
        | { id: string; role: string }
        | undefined,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('rejects an existing JWT when the Supervisor is disabled', async () => {
    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'supervisor-account-1',
      role: 'SUPERVISOR',
      purpose: 'access',
    } as never);

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'supervisor-account-1',
      role: 'SUPERVISOR',
      status: 'DISABLED',
    } as never);

    const { context, request } = createContext();

    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'supervisor-account-1',
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    expect(request.user).toBeUndefined();
  });

  it('allows an active Supervisor with a valid JWT', async () => {
    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'supervisor-account-1',
      role: 'SUPERVISOR',
      purpose: 'access',
    } as never);

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'supervisor-account-1',
      role: 'SUPERVISOR',
      status: 'ACTIVE',
    } as never);

    const { context, request } = createContext();

    await expect(
      guard.canActivate(context),
    ).resolves.toBe(true);

    expect(request.user).toEqual({
      id: 'supervisor-account-1',
      role: 'SUPERVISOR',
    });
  });
});