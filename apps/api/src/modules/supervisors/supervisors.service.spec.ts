import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SupervisorsService } from './supervisors.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  AccountRole,
  AccountStatus,
} from '../../generated/prisma/client';

describe('SupervisorsService', () => {
  let service: SupervisorsService;

  const prismaMock = {
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    faculty: {
      findUnique: jest.fn(),
    },
    supervisorProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          SupervisorsService,
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service = module.get<SupervisorsService>(
      SupervisorsService,
    );
  });

  describe('create', () => {
    const dto = {
      fullName: 'Test Supervisor',
      email: 'supervisor@clubhub.local',
      password: 'SecurePassword123!',
      facultyId: '78723226-bf84-4275-a2f8-843c2b899523',
    };

    it('rejects duplicate emails', async () => {
      prismaMock.account.findUnique.mockResolvedValue({
        id: 'existing-account',
      });

      await expect(service.create(dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects an unknown faculty', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);
      prismaMock.faculty.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a supervisor with the correct role', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);
      prismaMock.faculty.findUnique.mockResolvedValue({
        id: dto.facultyId,
      });

      const accountCreate = jest.fn().mockResolvedValue({
        id: 'account-123',
      });

      const profileCreate = jest.fn().mockResolvedValue({
        id: 'supervisor-123',
        fullName: dto.fullName,
        account: {
          role: AccountRole.SUPERVISOR,
          status: AccountStatus.ACTIVE,
        },
      });

      prismaMock.$transaction.mockImplementation(
        async (callback) =>
          callback({
            account: { create: accountCreate },
            supervisorProfile: { create: profileCreate },
          }),
      );

      const result = await service.create(dto);

      expect(result.account.role).toBe(
        AccountRole.SUPERVISOR,
      );

      expect(accountCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: dto.email,
          role: AccountRole.SUPERVISOR,
          status: AccountStatus.ACTIVE,
          passwordHash: expect.any(String),
        }),
      });

      expect(profileCreate).toHaveBeenCalled();
    });
    it('returns 409 when PostgreSQL rejects a duplicate email', async () => {
  prismaMock.account.findUnique.mockResolvedValue(null);

  prismaMock.faculty.findUnique.mockResolvedValue({
    id: dto.facultyId,
  });

  const prismaError = new Prisma.PrismaClientKnownRequestError(
  'Unique constraint failed',
  {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta: {
      modelName: 'Account',
      target: ['email'],
    },
  },
);

  prismaMock.$transaction.mockRejectedValue(prismaError);

  await expect(service.create(dto)).rejects.toThrow(
    ConflictException,
  );
});

  });
describe('update', () => {
  it('returns 409 when updating to an email already in use', async () => {
    const supervisorId = 'f0d828d2-2013-48ad-9147-393ad3bc4071';

    prismaMock.supervisorProfile.findUnique.mockResolvedValue({
      id: supervisorId,
      accountId: 'account-123',
    });

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: {
          modelName: 'Account',
          target: ['email'],
        },
      },
    );

    prismaMock.$transaction.mockRejectedValue(prismaError);

    await expect(
      service.update(supervisorId, {
        email: 'existing@clubhub.local',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
  describe('updateStatus', () => {
    it('rejects an unknown supervisor', async () => {
      prismaMock.supervisorProfile.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.updateStatus(
          'missing-id',
          AccountStatus.DISABLED,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('deactivates a supervisor account', async () => {
      prismaMock.supervisorProfile.findUnique.mockResolvedValue({
        id: 'supervisor-123',
        accountId: 'account-123',
      });

      prismaMock.account.update.mockResolvedValue({
        id: 'account-123',
        status: AccountStatus.DISABLED,
      });

      const result = await service.updateStatus(
        'supervisor-123',
        AccountStatus.DISABLED,
      );

      expect(result.status).toBe(AccountStatus.DISABLED);

      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: {
          id: 'account-123',
        },
        data: {
          status: AccountStatus.DISABLED,
        },
        select: expect.any(Object),
      });
    });
  });
});