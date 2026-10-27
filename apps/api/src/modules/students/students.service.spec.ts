import { jest } from '@jest/globals';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('StudentsService - Sprint 2.4', () => {
  let service: StudentsService;

  const prismaMock = {
    universityStudent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const studentProfile = {
    id: 'student-1',
    universityId: '12345678',
    email: 'student@stu.najah.edu',
    fullName: 'Test Student',
    major: {
      id: 'major-1',
      name: 'Computer Engineering',
      faculty: {
        id: 'faculty-1',
        name: 'Engineering',
      },
    },
    account: {
      id: 'account-1',
      role: 'STUDENT',
      status: 'ACTIVE',
      profilePhotoUrl: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new StudentsService(
      prismaMock as unknown as PrismaService,
    );

    prismaMock.$transaction.mockImplementation(
      async (...args: unknown[]) => {
        const operations = args[0] as Promise<unknown>[];
        return Promise.all(operations);
      },
    );

    prismaMock.universityStudent.findMany.mockResolvedValue(
      [] as never,
    );

    prismaMock.universityStudent.count.mockResolvedValue(
      0 as never,
    );
  });

  describe('getMyProfile', () => {
    it('returns the profile linked to the authenticated account', async () => {
      prismaMock.universityStudent.findFirst.mockResolvedValue(
        studentProfile as never,
      );

      const result = await service.getMyProfile('account-1');

      expect(result).toEqual(studentProfile);

      expect(prismaMock.universityStudent.findFirst)
        .toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              account: {
                is: {
                  id: 'account-1',
                },
              },
            },
          }),
        );
    });

    it('returns 404 when the Student profile does not exist', async () => {
      prismaMock.universityStudent.findFirst.mockResolvedValue(
        null as never,
      );

      await expect(
        service.getMyProfile('missing-account'),
      ).rejects.toThrow(NotFoundException);
    });
  });
  describe('Sprint 4.2.2 - Board candidate search', () => {
  const candidate = {
    id: 'student-1',
    universityId: '12345678',
    fullName: 'Test Student',
    email: 'student@stu.najah.edu',
    major: {
      id: 'major-1',
      name: 'Computer Engineering',
      faculty: {
        id: 'faculty-1',
        name: 'Engineering',
      },
    },
    account: {
      id: 'account-1',
    },
  };

  it('searches students by official name', async () => {
    prismaMock.universityStudent.findMany.mockResolvedValue(
      [candidate] as never,
    );

    prismaMock.universityStudent.count.mockResolvedValue(
      1 as never,
    );

    const result = await service.searchBoardCandidates('Test');

    expect(result.data).toEqual([candidate]);
    expect(result.meta.total).toBe(1);

    const query =
      prismaMock.universityStudent.findMany.mock.calls[0][0] as any;

    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        {
          fullName: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
      ]),
    );
  });

  it('searches students by university registration ID', async () => {
    prismaMock.universityStudent.findMany.mockResolvedValue(
      [candidate] as never,
    );

    prismaMock.universityStudent.count.mockResolvedValue(
      1 as never,
    );

    const result = await service.searchBoardCandidates('12345678');

    expect(result.data).toHaveLength(1);

    const query =
      prismaMock.universityStudent.findMany.mock.calls[0][0] as any;

    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        {
          universityId: {
            contains: '12345678',
          },
        },
      ]),
    );
  });

  it('returns multiple students with identical names', async () => {
    const secondCandidate = {
      ...candidate,
      id: 'student-2',
      universityId: '87654321',
      account: {
        id: 'account-2',
      },
    };

    prismaMock.universityStudent.findMany.mockResolvedValue(
      [candidate, secondCandidate] as never,
    );

    prismaMock.universityStudent.count.mockResolvedValue(
      2 as never,
    );

    const result = await service.searchBoardCandidates(
      'Test Student',
    );

    expect(result.data).toHaveLength(2);

    expect(
      result.data.map((student) => student.universityId),
    ).toEqual(['12345678', '87654321']);
  });

  it('restricts results to active ClubHub student accounts', async () => {
    await service.searchBoardCandidates('Test');

    expect(
      prismaMock.universityStudent.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: {
            is: {
              role: 'STUDENT',
              status: 'ACTIVE',
            },
          },
        }),
      }),
    );
  });

  it('returns an empty list when no student matches', async () => {
    const result = await service.searchBoardCandidates(
      'NonexistentStudent',
    );

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('rejects searches shorter than two characters', async () => {
    await expect(
      service.searchBoardCandidates('A'),
    ).rejects.toThrow(BadRequestException);

    expect(
      prismaMock.universityStudent.findMany,
    ).not.toHaveBeenCalled();
  });

  it('rejects an empty search', async () => {
    await expect(
      service.searchBoardCandidates(''),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects searches longer than 150 characters', async () => {
    await expect(
      service.searchBoardCandidates('A'.repeat(151)),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid pagination', async () => {
    await expect(
      service.searchBoardCandidates('Test', '0', '10'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.searchBoardCandidates('Test', '1', '100'),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns correct pagination metadata', async () => {
    prismaMock.universityStudent.count.mockResolvedValue(
      25 as never,
    );

    const result = await service.searchBoardCandidates(
      'Test',
      '2',
      '10',
    );

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });

    expect(
      prismaMock.universityStudent.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it('retrieves student information without sensitive account fields', async () => {
    await service.searchBoardCandidates('Test');

    expect(
      prismaMock.universityStudent.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          universityId: true,
          fullName: true,
          email: true,
          major: expect.any(Object),
          account: {
            select: {
              id: true,
            },
          },
        }),
      }),
    );
  });
});

});