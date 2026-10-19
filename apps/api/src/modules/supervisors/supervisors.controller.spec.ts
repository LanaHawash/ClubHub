import { Test } from '@nestjs/testing';
import {
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';

import { SupervisorsController } from './supervisors.controller';
import { SupervisorsService } from './supervisors.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

import { AccountRole } from '../../generated/prisma/client';

describe('SupervisorsController Authorization', () => {
  let app: INestApplication;

  let currentUser: {
    id: string;
    role: AccountRole;
  } | null = null;

  const supervisorsServiceMock = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };

  const jwtGuardMock = {
    canActivate: jest.fn((context) => {
      if (!currentUser) {
        throw new UnauthorizedException(
          'Authentication required',
        );
      }

      const req = context.switchToHttp().getRequest();

      req.user = currentUser;

      return true;
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupervisorsController],
      providers: [
        {
          provide: SupervisorsService,
          useValue: supervisorsServiceMock,
        },
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuardMock)
      .compile();

    app = moduleRef.createNestApplication();

    await app.init();
  });

  beforeEach(() => {
    currentUser = null;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated visitors', async () => {
    await request(app.getHttpServer())
      .get('/supervisors')
      .expect(401);
  });

  it.each([
    AccountRole.STUDENT,
    AccountRole.SUPERVISOR,
    AccountRole.CLUB,
  ])('rejects the %s role', async (role) => {
    currentUser = {
      id: 'test-account',
      role,
    };

    await request(app.getHttpServer())
      .get('/supervisors')
      .expect(403);
  });

  it('allows Deanship to list supervisors', async () => {
    currentUser = {
      id: 'deanship-account',
      role: AccountRole.DEANSHIP,
    };

    await request(app.getHttpServer())
      .get('/supervisors')
      .expect(200)
      .expect([]);

    expect(
      supervisorsServiceMock.findAll,
    ).toHaveBeenCalledTimes(1);
  });
});