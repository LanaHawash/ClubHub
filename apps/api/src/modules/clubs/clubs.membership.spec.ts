import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('ClubsService - Sprint 5 Membership Creation', () => {
  const createdClub = {
    id: 'club-sprint-5',
    name: 'Sprint 5 Test Club',
  };

  const txMock = {
    club: {
      create: jest.fn(),
    },

    clubMembershipSettings: {
      create: jest.fn(),
    },

    clubMembershipFeeVersion: {
      create: jest.fn(),
    },

    clubRegistrationWindow: {
      create: jest.fn(),
    },
  };

  type TransactionCallback = (
    tx: typeof txMock,
  ) => Promise<unknown>;

  const prismaMock = {
    supervisorProfile: {
      findUnique: jest.fn(),
    },

    faculty: {
      findUnique: jest.fn(),
    },

    major: {
      findMany: jest.fn(),
    },

    $transaction:
      jest.fn<
        (callback: TransactionCallback) => Promise<unknown>
      >(),
  };

  let service: ClubsService;

  const baseDto: CreateClubDto = {
    name: 'Sprint 5 Test Club',
    description: 'Testing membership configuration',
    contactEmail: 'test@example.com',
    classification: 'GENERAL',

    boardMembers: [],
    administrators: [],
    labelIds: [],
    newLabels: [],

    membership: {
      firstTimeFee: '30.00',
      renewalFee: '20.00',
      currency: 'ILS',
      registrationMode: 'ALWAYS_OPEN',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClubsService(
      prismaMock as unknown as PrismaService,
    );

    prismaMock.$transaction.mockImplementation(
      async (callback) => callback(txMock),
    );

    txMock.club.create.mockResolvedValue(
      createdClub as never,
    );

    txMock.clubMembershipSettings.create.mockResolvedValue(
      {} as never,
    );

    txMock.clubMembershipFeeVersion.create.mockResolvedValue(
      {} as never,
    );

    txMock.clubRegistrationWindow.create.mockResolvedValue(
      {} as never,
    );
  });

  it('creates settings and an effective fee version for an always-open club', async () => {
    await service.create(baseDto);

    expect(txMock.club.create).toHaveBeenCalledTimes(1);

    expect(
      txMock.clubMembershipSettings.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: createdClub.id,
        registrationMode: 'ALWAYS_OPEN',
        currency: 'ILS',
        pendingFirstTimeFee: expect.anything(),
        pendingRenewalFee: expect.anything(),
      }),
    });

    expect(
      txMock.clubMembershipFeeVersion.create,
    ).toHaveBeenCalledTimes(1);

    expect(
      txMock.clubRegistrationWindow.create,
    ).not.toHaveBeenCalled();
  });

  it('creates a scheduled registration window for a windowed club', async () => {
    const dto: CreateClubDto = {
      ...baseDto,
      membership: {
        ...baseDto.membership,
        registrationMode: 'WINDOWED',
        opensAt: '2099-01-01T00:00:00.000Z',
        closesAt: '2099-02-01T00:00:00.000Z',
      },
    };

    await service.create(dto);

    expect(
      txMock.clubMembershipSettings.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        registrationMode: 'WINDOWED',
      }),
    });

    expect(
      txMock.clubRegistrationWindow.create,
    ).toHaveBeenCalledWith({
      data: {
        clubId: createdClub.id,
        opensAt: new Date(
          '2099-01-01T00:00:00.000Z',
        ),
        closesAt: new Date(
          '2099-02-01T00:00:00.000Z',
        ),
      },
    });

    // Scheduled windows must not lock their prices early.
    expect(
      txMock.clubMembershipFeeVersion.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects missing membership configuration', async () => {
    const dto = {
      ...baseDto,
      membership: undefined,
    } as unknown as CreateClubDto;

    await expect(
      service.create(dto),
    ).rejects.toThrow(BadRequestException);

    expect(
      txMock.club.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects zero membership fees', async () => {
    const dto: CreateClubDto = {
      ...baseDto,
      membership: {
        ...baseDto.membership,
        firstTimeFee: '0',
      },
    };

    await expect(
      service.create(dto),
    ).rejects.toThrow(BadRequestException);

    expect(
      txMock.clubMembershipSettings.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects windowed registration without dates', async () => {
    const dto: CreateClubDto = {
      ...baseDto,
      membership: {
        ...baseDto.membership,
        registrationMode: 'WINDOWED',
      },
    };

    await expect(
      service.create(dto),
    ).rejects.toThrow(BadRequestException);

    expect(
      txMock.club.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects a registration window that closes before opening', async () => {
    const dto: CreateClubDto = {
      ...baseDto,
      membership: {
        ...baseDto.membership,
        registrationMode: 'WINDOWED',
        opensAt: '2099-02-01T00:00:00.000Z',
        closesAt: '2099-01-01T00:00:00.000Z',
      },
    };

    await expect(
      service.create(dto),
    ).rejects.toThrow(BadRequestException);

    expect(
      txMock.clubRegistrationWindow.create,
    ).not.toHaveBeenCalled();
  });

  it('propagates membership persistence failures from the transaction', async () => {
    txMock.clubMembershipSettings.create.mockRejectedValue(
      new Error('Database write failed') as never,
    );

    await expect(
      service.create(baseDto),
    ).rejects.toThrow('Database write failed');

    expect(
      prismaMock.$transaction,
    ).toHaveBeenCalledTimes(1);

    expect(
      txMock.clubMembershipFeeVersion.create,
    ).not.toHaveBeenCalled();
  });
});