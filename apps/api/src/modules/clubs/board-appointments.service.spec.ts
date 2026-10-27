import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { BoardAppointmentsService } from './board-appointments.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ClubEligibilityService } from './club-eligibility.service';

describe('BoardAppointmentsService - Sprint 4.2', () => {
  let service: BoardAppointmentsService;

  const clubId = '11111111-1111-4111-8111-111111111111';
  const studentId = '22222222-2222-4222-8222-222222222222';
  const accountId = '33333333-3333-4333-8333-333333333333';

  const prisma = {
    club: {
      findUnique: jest.fn(),
    },
    universityStudent: {
      findUnique: jest.fn(),
    },
    boardAppointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clubAdminAssignment: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const eligibility = {
    evaluateForAccount: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    service = new BoardAppointmentsService(
      prisma as unknown as PrismaService,
      eligibility as unknown as ClubEligibilityService,
    );

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    prisma.$queryRaw.mockResolvedValue([]);

    prisma.club.findUnique.mockResolvedValue({
      id: clubId,
      status: 'ACTIVE',
    });

    prisma.universityStudent.findUnique.mockResolvedValue({
      id: studentId,
      account: {
        id: accountId,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    });

    eligibility.evaluateForAccount.mockResolvedValue({
      eligible: true,
      reason: 'ELIGIBLE',
    });

    prisma.boardAppointment.findMany.mockResolvedValue([]);
    prisma.clubAdminAssignment.count.mockResolvedValue(0);
    prisma.clubAdminAssignment.updateMany.mockResolvedValue({
      count: 0,
    });

    prisma.boardAppointment.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'appointment-1',
        ...data,
      }),
    );
  });

  it('creates a board appointment for an eligible ClubHub student', async () => {
    const result = await service.create(clubId, {
      studentId,
      position: 'Treasurer',
      startDate: '2026-10-01',
    });

    expect(result.position).toBe('Treasurer');

    expect(prisma.boardAppointment.create).toHaveBeenCalled();

    expect(eligibility.evaluateForAccount).toHaveBeenCalledWith(
      accountId,
      clubId,
    );
  });

  it('rejects students without an active ClubHub account', async () => {
    prisma.universityStudent.findUnique.mockResolvedValue({
      id: studentId,
      account: null,
    });

    await expect(
      service.create(clubId, {
        studentId,
        position: 'Treasurer',
        startDate: '2026-10-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects students who are not eligible for the club', async () => {
    eligibility.evaluateForAccount.mockResolvedValue({
      eligible: false,
      reason: 'MAJOR_NOT_ALLOWED',
    });

    await expect(
      service.create(clubId, {
        studentId,
        position: 'Treasurer',
        startDate: '2026-10-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an appointment for a nonexistent club', async () => {
    prisma.club.findUnique.mockResolvedValue(null);

    await expect(
      service.create(clubId, {
        studentId,
        position: 'Treasurer',
        startDate: '2026-10-01',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('prevents overlapping appointments for the same student', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        studentId,
        position: 'Secretary',
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
    ]);

    await expect(
      service.create(clubId, {
        studentId,
        position: 'Treasurer',
        startDate: '2026-10-01',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents overlapping president appointments', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        studentId: 'different-student',
        position: 'President',
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
    ]);

    await expect(
      service.create(clubId, {
        studentId,
        position: 'President',
        startDate: '2026-10-01',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns the current board', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        studentId,
        position: 'Treasurer',
      },
    ]);

    const result = await service.current(clubId);

    expect(result).toHaveLength(1);
    expect(result[0].position).toBe('Treasurer');
  });

  it('returns board appointment history', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        studentId,
        position: 'President',
        endDate: new Date('2025-12-31'),
      },
    ]);

    const result = await service.history(clubId);

    expect(result).toHaveLength(1);
  });

  it('rejects ending an appointment that does not exist', async () => {
    prisma.boardAppointment.findUnique.mockResolvedValue(null);

    await expect(
      service.end(
        'missing-appointment',
        '2026-10-01',
        accountId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('revokes administrator access when ending a board appointment', async () => {
    prisma.boardAppointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      clubId,
      startDate: new Date('2026-01-01'),
      endDate: null,
    });

    prisma.boardAppointment.update.mockResolvedValue({
      id: 'appointment-1',
      endDate: new Date('2026-10-01'),
    });

    await service.end(
      'appointment-1',
      '2026-10-01',
      accountId,
    );

    expect(
      prisma.clubAdminAssignment.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        boardAppointmentId: 'appointment-1',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        revokedById: accountId,
      },
    });
  });
  it('prevents moving an active administrator appointment into the future', async () => {
  prisma.boardAppointment.findUnique.mockResolvedValue({
    id: 'appointment-1',
    clubId,
    studentId,
    position: 'Treasurer',
    startDate: new Date('2026-01-01'),
    endDate: null,
  });

  prisma.clubAdminAssignment.count.mockResolvedValue(1);

  await expect(
    service.update('appointment-1', {
      startDate: '2099-01-01',
    }),
  ).rejects.toThrow(ConflictException);

  expect(prisma.boardAppointment.update).not.toHaveBeenCalled();
});
});