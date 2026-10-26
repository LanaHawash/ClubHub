import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import {
  AccountRole,
  AccountStatus,
  ClubAdminPosition,
  Prisma,
} from '../../generated/prisma/client';

import { ClubAdminAssignmentsService } from './club-admin-assignments.service';

describe('ClubAdminAssignmentsService', () => {
  const clubId = '11111111-1111-4111-8111-111111111111';
  const studentAccountId = '22222222-2222-4222-8222-222222222222';
  const deanshipAccountId = '33333333-3333-4333-8333-333333333333';
  const assignmentId = '55555555-5555-4555-8555-555555555555';
  const prisma = {
    club: {
      findUnique: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
    },
clubAdminAssignment: {
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  updateMany: jest.fn(),
},
  };

  let service: ClubAdminAssignmentsService;

  const dto = {
    accountId: studentAccountId,
    position: ClubAdminPosition.PRESIDENT,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClubAdminAssignmentsService(prisma as any);

    prisma.club.findUnique.mockResolvedValue({
      id: clubId,
    });

    prisma.account.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        if (where.id === studentAccountId) {
          return Promise.resolve({
            id: studentAccountId,
            role: AccountRole.STUDENT,
            status: AccountStatus.ACTIVE,
            universityStudentId: '44444444-4444-4444-8444-444444444444',
          });
        }

        if (where.id === deanshipAccountId) {
          return Promise.resolve({
            role: AccountRole.DEANSHIP,
            status: AccountStatus.ACTIVE,
          });
        }

        return Promise.resolve(null);
      },
    );

    prisma.clubAdminAssignment.create.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      clubId,
      accountId: studentAccountId,
      position: ClubAdminPosition.PRESIDENT,
      assignedAt: new Date(),
      revokedAt: null,
    });

    prisma.clubAdminAssignment.findFirst.mockResolvedValue({
  id: assignmentId,
  clubId,
  accountId: studentAccountId,
  position: ClubAdminPosition.PRESIDENT,
});

prisma.clubAdminAssignment.updateMany.mockResolvedValue({
  count: 1,
});
  });

  it('assigns an active student administrator', async () => {
    const result = await service.assignAdmin(
      clubId,
      dto,
      deanshipAccountId,
    );

    expect(result.accountId).toBe(studentAccountId);

    expect(prisma.clubAdminAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          clubId,
          accountId: studentAccountId,
          position: ClubAdminPosition.PRESIDENT,
          assignedById: deanshipAccountId,
        },
      }),
    );
  });

  it('rejects assignments to nonexistent clubs', async () => {
    prisma.club.findUnique.mockResolvedValue(null);

    await expect(
      service.assignAdmin(clubId, dto, deanshipAccountId),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects non-student accounts', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: studentAccountId,
      role: AccountRole.SUPERVISOR,
      status: AccountStatus.ACTIVE,
      universityStudentId: null,
    });

    await expect(
      service.assignAdmin(clubId, dto, deanshipAccountId),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects disabled students', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: studentAccountId,
      role: AccountRole.STUDENT,
      status: AccountStatus.DISABLED,
      universityStudentId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      service.assignAdmin(clubId, dto, deanshipAccountId),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects students without registered student records', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: studentAccountId,
      role: AccountRole.STUDENT,
      status: AccountStatus.ACTIVE,
      universityStudentId: null,
    });

    await expect(
      service.assignAdmin(clubId, dto, deanshipAccountId),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects assignment requests from non-Deanship accounts', async () => {
    prisma.account.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        if (where.id === studentAccountId) {
          return Promise.resolve({
            id: studentAccountId,
            role: AccountRole.STUDENT,
            status: AccountStatus.ACTIVE,
            universityStudentId: '44444444-4444-4444-8444-444444444444',
          });
        }

        return Promise.resolve({
          role: AccountRole.STUDENT,
          status: AccountStatus.ACTIVE,
        });
      },
    );

    await expect(
      service.assignAdmin(clubId, dto, deanshipAccountId),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate active assignments', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
      },
    );

    prisma.clubAdminAssignment.create.mockRejectedValue(uniqueError);

    await expect(
      service.assignAdmin(clubId, dto, deanshipAccountId),
    ).rejects.toThrow(ConflictException);
  });

  describe('revokeAdmin', () => {
  it('revokes an active administrator assignment', async () => {
    const result = await service.revokeAdmin(
      clubId,
      assignmentId,
      deanshipAccountId,
    );

    expect(result.message).toBe(
      'Administrator access revoked successfully.',
    );

    expect(prisma.clubAdminAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: assignmentId,
        clubId,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        revokedById: deanshipAccountId,
      },
    });
  });

  it('does not revoke an assignment from another club', async () => {
    prisma.clubAdminAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.revokeAdmin(clubId, assignmentId, deanshipAccountId),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.clubAdminAssignment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a second simultaneous revocation', async () => {
    prisma.clubAdminAssignment.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.revokeAdmin(clubId, assignmentId, deanshipAccountId),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects revocation by a non-Deanship account', async () => {
    prisma.account.findUnique.mockResolvedValue({
      role: AccountRole.STUDENT,
      status: AccountStatus.ACTIVE,
    });

    await expect(
      service.revokeAdmin(clubId, assignmentId, deanshipAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.clubAdminAssignment.updateMany).not.toHaveBeenCalled();
  });
});

describe('getMyAdminAssignments', () => {
  it('returns only active assignments for the authenticated student', async () => {
    const assignments = [
      {
        id: assignmentId,
        clubId,
        position: ClubAdminPosition.PRESIDENT,
        assignedAt: new Date(),
        club: {
          id: clubId,
          name: 'IEEE',
          logoUrl: null,
          classification: 'GENERAL',
        },
      },
    ];

    prisma.clubAdminAssignment.findMany.mockResolvedValue(assignments);

    const result = await service.getMyAdminAssignments(studentAccountId);

    expect(result).toEqual(assignments);

    expect(prisma.clubAdminAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId: studentAccountId,
          revokedAt: null,
          club: {
            status: 'ACTIVE',
          },
        },
      }),
    );
  });

  it('returns an empty list when the student has no active assignments', async () => {
    prisma.clubAdminAssignment.findMany.mockResolvedValue([]);

    const result = await service.getMyAdminAssignments(studentAccountId);

    expect(result).toEqual([]);
  });

  it('rejects inactive or non-student accounts', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: studentAccountId,
      role: AccountRole.STUDENT,
      status: AccountStatus.DISABLED,
      universityStudentId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      service.getMyAdminAssignments(studentAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.clubAdminAssignment.findMany).not.toHaveBeenCalled();
  });
});
describe('getClubAdminOverview', () => {
  it('allows an assigned student to access the correct club', async () => {
    prisma.clubAdminAssignment.findFirst.mockResolvedValue({
      id: assignmentId,
      position: ClubAdminPosition.PRESIDENT,
    });

    prisma.club.findUnique.mockResolvedValue({
      id: clubId,
      name: 'IEEE',
      description: 'Engineering club',
      logoUrl: null,
      classification: 'GENERAL',
      status: 'ACTIVE',
      foundedYear: 2020,
      contactEmail: 'ieee@example.com',
      meetingInfo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      supervisor: null,
    });

    const result = await service.getClubAdminOverview(
      clubId,
      studentAccountId,
    );

    expect(result.club.id).toBe(clubId);
    expect(result.administrator.position).toBe(
      ClubAdminPosition.PRESIDENT,
    );

    expect(prisma.clubAdminAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId,
          accountId: studentAccountId,
          revokedAt: null,
          club: {
            status: 'ACTIVE',
          },
        },
      }),
    );
  });

  it('denies access when the student has no active assignment', async () => {
    prisma.clubAdminAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.getClubAdminOverview(clubId, studentAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.club.findUnique).not.toHaveBeenCalled();
  });

  it('denies access to another club', async () => {
    const otherClubId = '66666666-6666-4666-8666-666666666666';

    prisma.clubAdminAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.getClubAdminOverview(otherClubId, studentAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.clubAdminAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubId: otherClubId,
          accountId: studentAccountId,
          revokedAt: null,
        }),
      }),
    );
  });

  it('denies access to disabled student accounts', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: studentAccountId,
      role: AccountRole.STUDENT,
      status: AccountStatus.DISABLED,
      universityStudentId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      service.getClubAdminOverview(clubId, studentAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.clubAdminAssignment.findFirst).not.toHaveBeenCalled();
  });
});
describe('assertCanManageClub', () => {
  it('allows a currently assigned student administrator', async () => {
    prisma.clubAdminAssignment.findFirst.mockResolvedValue({
      id: assignmentId,
      position: ClubAdminPosition.PRESIDENT,
    });

    const result = await service.assertCanManageClub(
      clubId,
      studentAccountId,
    );

    expect(result.position).toBe(ClubAdminPosition.PRESIDENT);

    expect(prisma.clubAdminAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId,
          accountId: studentAccountId,
          revokedAt: null,
          club: {
            status: 'ACTIVE',
          },
        },
      }),
    );
  });

  it('allows a second administrator to access the same club', async () => {
    prisma.clubAdminAssignment.findFirst.mockResolvedValue({
      id: assignmentId,
      position: ClubAdminPosition.SECOND_ADMIN,
    });

    const result = await service.assertCanManageClub(
      clubId,
      studentAccountId,
    );

    expect(result.position).toBe(ClubAdminPosition.SECOND_ADMIN);
  });

  it('denies students without an active assignment', async () => {
    prisma.clubAdminAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.assertCanManageClub(clubId, studentAccountId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies access to a different club', async () => {
    const anotherClubId =
      '77777777-7777-4777-8777-777777777777';

    prisma.clubAdminAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.assertCanManageClub(
        anotherClubId,
        studentAccountId,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.clubAdminAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubId: anotherClubId,
          accountId: studentAccountId,
        }),
      }),
    );
  });

  it('denies access after an assignment is revoked', async () => {
    // A revoked assignment is excluded by revokedAt: null.
    prisma.clubAdminAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.assertCanManageClub(clubId, studentAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.clubAdminAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revokedAt: null,
        }),
      }),
    );
  });

  it('denies disabled students before checking assignments', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: studentAccountId,
      role: AccountRole.STUDENT,
      status: AccountStatus.DISABLED,
      universityStudentId:
        '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      service.assertCanManageClub(clubId, studentAccountId),
    ).rejects.toThrow(ForbiddenException);

    expect(
      prisma.clubAdminAssignment.findFirst,
    ).not.toHaveBeenCalled();
  });
});
});