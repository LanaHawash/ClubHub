import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('ClubsService - Sprint 3.2', () => {
  let service: ClubsService;

  const prismaMock = {
  club: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  supervisorProfile: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};
  const clubs = [
    {
      id: 'club-1',
      name: 'Engineering Club',
      status: 'ACTIVE',
    },
    {
      id: 'club-2',
      name: 'Science Club',
      status: 'ACTIVE',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClubsService(
      prismaMock as unknown as PrismaService,
    );

    // Simulate Prisma's transaction response.
    prismaMock.$transaction.mockImplementation(
      async (...args: unknown[]) => {
        const operations = args[0] as Promise<unknown>[];
        return Promise.all(operations);
      },
    );

    prismaMock.club.findMany.mockResolvedValue(clubs as never);
    prismaMock.club.count.mockResolvedValue(5 as never);
  });

  describe('findAll', () => {
    it('returns paginated active clubs', async () => {
      const result = await service.findAll('1', '2');

      expect(result.data).toEqual(clubs);

      expect(result.meta).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      });

      expect(prismaMock.club.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
          skip: 0,
          take: 2,
        }),
      );

      expect(prismaMock.club.count).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
    });

    it('calculates the correct offset for page 2', async () => {
      await service.findAll('2', '2');

      expect(prismaMock.club.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 2,
          take: 2,
        }),
      );
    });

    it('uses default pagination values', async () => {
      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);

      expect(prismaMock.club.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });

    it('returns an empty page with correct metadata', async () => {
      prismaMock.club.findMany.mockResolvedValue([] as never);

      const result = await service.findAll('4', '2');

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        page: 4,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });

    it.each([
      ['0', undefined],
      ['-1', undefined],
      ['abc', undefined],
      ['1.5', undefined],
      [undefined, '0'],
      [undefined, '-2'],
      [undefined, 'abc'],
      [undefined, '101'],
    ])(
      'rejects invalid pagination: page=%s, limit=%s',
      async (page, limit) => {
        await expect(
          service.findAll(page, limit),
        ).rejects.toThrow(BadRequestException);

        expect(prismaMock.club.findMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('findOne', () => {
    it('retrieves only an active club', async () => {
      const club = clubs[0];

      prismaMock.club.findFirst.mockResolvedValue(club as never);

      const result = await service.findOne(club.id);

      expect(result).toEqual(club);

      expect(prismaMock.club.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: club.id,
            status: 'ACTIVE',
          },
        }),
      );
    });

    it('returns 404 when a club is unavailable', async () => {
      prismaMock.club.findFirst.mockResolvedValue(null as never);

      await expect(
        service.findOne('missing-club'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForDeanship', () => {
  it('returns clubs regardless of their status', async () => {
    const mixedClubs = [
      { id: 'club-1', name: 'Engineering Club', status: 'ACTIVE' },
      { id: 'club-2', name: 'Archived Club', status: 'ARCHIVED' },
    ];

    prismaMock.club.findMany.mockResolvedValue(mixedClubs as never);
    prismaMock.club.count.mockResolvedValue(2 as never);

    const result = await service.findAllForDeanship('1', '10');

    expect(result.data).toEqual(mixedClubs);

    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });

    // Deanship queries must not restrict clubs to ACTIVE.
    const query = prismaMock.club.findMany.mock.calls[0][0] as {
      where?: { status?: string };
    };

    expect(query.where?.status).toBeUndefined();

    // The total should also include archived clubs.
    const countArgs = prismaMock.club.count.mock.calls[0];

    expect(countArgs?.[0]).toBeUndefined();
  });

  it('paginates the Deanship listing correctly', async () => {
    await service.findAllForDeanship('2', '2');

    expect(prismaMock.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 2,
        take: 2,
      }),
    );
  });
});


describe('findOneForDeanship', () => {
  it('retrieves an archived club', async () => {
    const archivedClub = {
      id: 'archived-club',
      name: 'Archived Club',
      status: 'ARCHIVED',
    };

    prismaMock.club.findUnique.mockResolvedValue(archivedClub as never);

    const result = await service.findOneForDeanship(
      archivedClub.id,
    );

    expect(result).toEqual(archivedClub);

    expect(prismaMock.club.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: archivedClub.id,
        },
      }),
    );
  });

  it('returns 404 when the club does not exist', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as never);

    await expect(
      service.findOneForDeanship('missing-club'),
    ).rejects.toThrow(NotFoundException);
  });
});


describe('Sprint 3.3 - Archive clubs', () => {
  const clubId = 'club-1';

  it('archives an active club', async () => {
    prismaMock.club.updateMany.mockResolvedValue({ count: 1 } as never);

    prismaMock.club.findUnique.mockResolvedValue({
      id: clubId,
      name: 'Engineering Club',
      status: 'ARCHIVED',
    } as never);

    const result = await service.archive(clubId);

    expect(prismaMock.club.updateMany).toHaveBeenCalledWith({
      where: {
        id: clubId,
        status: 'ACTIVE',
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    expect(result.status).toBe('ARCHIVED');
  });

  it('rejects archiving an already archived club', async () => {
    prismaMock.club.updateMany.mockResolvedValue({ count: 0 } as never);

    prismaMock.club.findUnique.mockResolvedValue({
      id: clubId,
      status: 'ARCHIVED',
    } as never);

    await expect(service.archive(clubId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns 404 when archiving a nonexistent club', async () => {
    prismaMock.club.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.club.findUnique.mockResolvedValue(null as never);

    await expect(service.archive(clubId)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('Sprint 3.3 - Activate clubs', () => {
  const clubId = 'club-1';

  it('activates an archived club', async () => {
    prismaMock.club.updateMany.mockResolvedValue({ count: 1 } as never);

    prismaMock.club.findUnique.mockResolvedValue({
      id: clubId,
      name: 'Engineering Club',
      status: 'ACTIVE',
    } as never);

    const result = await service.activate(clubId);

    expect(prismaMock.club.updateMany).toHaveBeenCalledWith({
      where: {
        id: clubId,
        status: 'ARCHIVED',
      },
      data: {
        status: 'ACTIVE',
      },
    });

    expect(result.status).toBe('ACTIVE');
  });

  it('rejects activating an already active club', async () => {
    prismaMock.club.updateMany.mockResolvedValue({ count: 0 } as never);

    prismaMock.club.findUnique.mockResolvedValue({
      id: clubId,
      status: 'ACTIVE',
    } as never);

    await expect(service.activate(clubId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns 404 when activating a nonexistent club', async () => {
    prismaMock.club.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.club.findUnique.mockResolvedValue(null as never);

    await expect(service.activate(clubId)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('Sprint 3.4 - Supervisor assignment', () => {
  const clubId = 'club-1';
  const supervisorId = 'supervisor-1';

  const activeSupervisor = {
    id: supervisorId,
    fullName: 'Dr. Ahmad',
    account: {
      status: 'ACTIVE',
      role: 'SUPERVISOR',
    },
  };

  beforeEach(() => {
    prismaMock.club.findUnique.mockResolvedValue({
      id: clubId,
    } as never);

    prismaMock.supervisorProfile.findUnique.mockResolvedValue(
      activeSupervisor as never,
    );

    prismaMock.club.update.mockResolvedValue({
      id: clubId,
      supervisorId,
      supervisor: activeSupervisor,
    } as never);
  });

  it('assigns an active supervisor to a club', async () => {
    const result = await service.assignSupervisor(
      clubId,
      supervisorId,
    );

    expect(prismaMock.club.update).toHaveBeenCalledWith({
      where: { id: clubId },
      data: { supervisorId },
      include: {
        supervisor: {
          select: {
            id: true,
            fullName: true,
            faculty: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    expect(result.supervisorId).toBe(supervisorId);
  });

  it('reassigns a club to another active supervisor', async () => {
    const newSupervisorId = 'supervisor-2';

    prismaMock.supervisorProfile.findUnique.mockResolvedValue({
      ...activeSupervisor,
      id: newSupervisorId,
    } as never);

    prismaMock.club.update.mockResolvedValue({
      id: clubId,
      supervisorId: newSupervisorId,
    } as never);

    const result = await service.assignSupervisor(
      clubId,
      newSupervisorId,
    );

    expect(result.supervisorId).toBe(newSupervisorId);

    expect(prismaMock.club.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: clubId },
        data: { supervisorId: newSupervisorId },
      }),
    );
  });

  it('rejects a disabled supervisor', async () => {
    prismaMock.supervisorProfile.findUnique.mockResolvedValue({
      ...activeSupervisor,
      account: {
        status: 'DISABLED',
        role: 'SUPERVISOR',
      },
    } as never);

    await expect(
      service.assignSupervisor(clubId, supervisorId),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.club.update).not.toHaveBeenCalled();
  });

  it('rejects a supervisor with an incorrect account role', async () => {
    prismaMock.supervisorProfile.findUnique.mockResolvedValue({
      ...activeSupervisor,
      account: {
        status: 'ACTIVE',
        role: 'STUDENT',
      },
    } as never);

    await expect(
      service.assignSupervisor(clubId, supervisorId),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.club.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent supervisor', async () => {
    prismaMock.supervisorProfile.findUnique.mockResolvedValue(
      null as never,
    );

    await expect(
      service.assignSupervisor(clubId, supervisorId),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.club.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent club', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as never);

    await expect(
      service.assignSupervisor(clubId, supervisorId),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.club.update).not.toHaveBeenCalled();
  });
});

});