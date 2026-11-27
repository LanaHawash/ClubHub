import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import {
  BoardAppointmentsService,
} from './board-appointments.service';

import {
  PrismaService,
} from '../../shared/prisma/prisma.service';

import {
  ClubEligibilityService,
} from './club-eligibility.service';

import {
  getLocalBoardDate,
  addBoardCalendarDays,
} from '../../shared/membership/board-term';

describe('BoardAppointmentsService - Sprint 6', () => {
  let service: BoardAppointmentsService;

  const clubId =
    '11111111-1111-4111-8111-111111111111';

  const studentId =
    '22222222-2222-4222-8222-222222222222';

  const accountId =
    '33333333-3333-4333-8333-333333333333';

  const deanshipId =
    '44444444-4444-4444-8444-444444444444';

  const DAY_MS =
    24 * 60 * 60 * 1000;

  let now: Date;

  let today: Date;

  let startDate: string;

  let endDate: string;

  const prisma = {
    account: {
      findUnique: jest.fn(),
    },

    club: {
      findUnique: jest.fn(),
    },

    universityStudent: {
      findUnique: jest.fn(),
    },

    boardAppointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },

    boardNomination: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },

    membershipApplication: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },

    membership: {
      findMany: jest.fn(),
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

  function appointmentDto(
    position = 'Treasurer',
  ) {
    return {
      studentId,

      position,

      startDate,

      endDate,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();

    now = new Date();

    today = getLocalBoardDate(now);

    startDate =
      today.toISOString().slice(0, 10);

    endDate =
      addBoardCalendarDays(
        today,
        90,
      ).toISOString().slice(0, 10);

    service = new BoardAppointmentsService(
      prisma as unknown as PrismaService,

      eligibility as unknown as ClubEligibilityService,
    );

    prisma.$transaction.mockImplementation(
      async (
        callback: (
          tx: typeof prisma,
        ) => Promise<unknown>,
      ) => callback(prisma),
    );

    /*
     * Simulate the different raw SQL operations:
     * - Row locking
     * - Advisory locking
     * - Authoritative database time
     * - Board coverage boundaries
     */
    prisma.$queryRaw.mockImplementation(
      async (
        strings: TemplateStringsArray,
        ..._values: unknown[]
      ) => {
        const sql = strings.join(' ');

        if (
          sql.includes('clock_timestamp()')
        ) {
          return [{ now }];
        }

        if (
          sql.includes('AS "startAt"') &&
          sql.includes('AS "endAt"')
        ) {
          return [
            {
              startAt: now,

              endAt: new Date(
                now.getTime() +
                  91 * DAY_MS,
              ),
            },
          ];
        }

        return [{ id: clubId }];
      },
    );

    /*
     * Authenticated Deanship account.
     */
    prisma.account.findUnique.mockResolvedValue({
      id: deanshipId,

      role: 'DEANSHIP',

      status: 'ACTIVE',
    });

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

    /*
     * No conflicting applications, nominations
     * or existing appointments by default.
     */
    prisma.membershipApplication.findMany.mockResolvedValue([]);

    prisma.membershipApplication.findFirst.mockResolvedValue(null);

    prisma.boardNomination.findMany.mockResolvedValue([]);

    prisma.boardNomination.findFirst.mockResolvedValue(null);

    prisma.boardAppointment.findMany.mockResolvedValue([]);

    /*
     * Default candidate has sufficient paid
     * membership coverage for direct appointment.
     */
    prisma.membership.findMany.mockResolvedValue([
      {
        id: 'membership-1',

        activatedAt: new Date(
          now.getTime() - DAY_MS,
        ),

        expiresAt: new Date(
          now.getTime() +
            300 * DAY_MS,
        ),
      },
    ]);

    prisma.clubAdminAssignment.count.mockResolvedValue(0);

    prisma.clubAdminAssignment.updateMany.mockResolvedValue({
      count: 0,
    });

    prisma.boardAppointment.create.mockImplementation(
      async ({
        data,
      }: {
        data: Record<string, unknown>;
      }) => ({
        id: 'appointment-1',

        ...data,
      }),
    );
  });

  // TEST 1
  it('creates a direct appointment for an eligible student with sufficient membership coverage', async () => {
    const result =
      await service.create(
        clubId,

        appointmentDto(),

        deanshipId,
      );

    expect(result.outcome).toBe(
      'DIRECT_APPOINTMENT',
    );

    expect(
      result.appointment?.position,
    ).toBe('Treasurer');

    expect(result.nomination).toBeNull();

    expect(result.application).toBeNull();

    expect(
      prisma.boardAppointment.create,
    ).toHaveBeenCalledTimes(1);

    expect(
      eligibility.evaluateForAccount,
    ).toHaveBeenCalledWith(
      accountId,

      clubId,

      prisma,
    );
  });

  // TEST 2
  it('rejects students without an active ClubHub account', async () => {
    prisma.universityStudent.findUnique.mockResolvedValue({
      id: studentId,

      account: null,
    });

    await expect(
      service.create(
        clubId,

        appointmentDto(),

        deanshipId,
      ),
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });

  // TEST 3
  it('rejects students who are not eligible for the club', async () => {
    eligibility.evaluateForAccount.mockResolvedValue({
      eligible: false,

      reason: 'MAJOR_NOT_ALLOWED',
    });

    await expect(
      service.create(
        clubId,

        appointmentDto(),

        deanshipId,
      ),
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });

  // TEST 4
  it('rejects an appointment for a nonexistent club', async () => {
    prisma.club.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        clubId,

        appointmentDto(),

        deanshipId,
      ),
    ).rejects.toThrow(
      NotFoundException,
    );
  });

  // TEST 5
  it('prevents overlapping appointments for the same student', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        studentId,

        position: 'Secretary',

        startDate:
          addBoardCalendarDays(
            today,
            -30,
          ),

        endDate: null,

        endedAt: null,
      },
    ]);

    await expect(
      service.create(
        clubId,

        appointmentDto(),

        deanshipId,
      ),
    ).rejects.toThrow(
      ConflictException,
    );

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });

  // TEST 6
  it('prevents overlapping president appointments', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        studentId: 'different-student',

        position: 'President',

        startDate:
          addBoardCalendarDays(
            today,
            -30,
          ),

        endDate: null,

        endedAt: null,
      },
    ]);

    await expect(
      service.create(
        clubId,

        appointmentDto('President'),

        deanshipId,
      ),
    ).rejects.toThrow(
      ConflictException,
    );

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });

  // TEST 7
  it('returns the current board', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',

        studentId,

        position: 'Treasurer',
      },
    ]);

    const result =
      await service.current(clubId);

    expect(result).toHaveLength(1);

    expect(result[0].position).toBe(
      'Treasurer',
    );
  });

  // TEST 8
  it('returns board appointment history', async () => {
    prisma.boardAppointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',

        studentId,

        position: 'President',

        endDate: new Date(
          '2025-12-31',
        ),
      },
    ]);

    const result =
      await service.history(clubId);

    expect(result).toHaveLength(1);
  });

  // TEST 9
  it('rejects ending an appointment that does not exist', async () => {
    prisma.boardAppointment.findUnique.mockResolvedValue(null);

    await expect(
      service.end(
        'missing-appointment',

        startDate,

        deanshipId,
      ),
    ).rejects.toThrow(
      NotFoundException,
    );
  });

  // TEST 10
  it('revokes administrator access when ending a board appointment', async () => {
    const appointment = {
      id: 'appointment-1',

      clubId,

      studentId,

      position: 'Treasurer',

      startDate:
        addBoardCalendarDays(
          today,
          -30,
        ),

      endDate: null,

      endedAt: null,
    };

    prisma.boardAppointment.findUnique.mockResolvedValue(
      appointment,
    );

    /*
     * Sprint 6 rereads the appointment after
     * acquiring the club transaction lock.
     */
    prisma.boardAppointment.findUniqueOrThrow.mockResolvedValue(
      appointment,
    );

    prisma.boardAppointment.update.mockResolvedValue({
      ...appointment,

      endedAt: now,
    });

    await service.end(
      'appointment-1',

      startDate,

      deanshipId,
    );

    expect(
      prisma.clubAdminAssignment.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        boardAppointmentId:
          'appointment-1',

        revokedAt: null,
      },

      data: {
        revokedAt: now,

        revokedById: deanshipId,
      },
    });

    expect(
      prisma.boardAppointment.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'appointment-1',
        },

        data: {
          endedAt: now,
        },
      }),
    );
  });

  // TEST 11
  it('prevents moving an active administrator appointment into the future', async () => {
    const appointment = {
      id: 'appointment-1',

      clubId,

      studentId,

      position: 'Treasurer',

      startDate:
        addBoardCalendarDays(
          today,
          -30,
        ),

      endDate:
        addBoardCalendarDays(
          today,
          90,
        ),

      endedAt: null,
    };

    prisma.boardAppointment.findUnique.mockResolvedValue(
      appointment,
    );

    prisma.boardAppointment.findUniqueOrThrow.mockResolvedValue(
      appointment,
    );

    prisma.clubAdminAssignment.count.mockResolvedValue(1);

    await expect(
      service.update(
        'appointment-1',

        {
          startDate:
            addBoardCalendarDays(
              today,
              5,
            ).toISOString().slice(0, 10),
        },
      ),
    ).rejects.toThrow(
      ConflictException,
    );

    expect(
      prisma.boardAppointment.update,
    ).not.toHaveBeenCalled();
  });

  // TEST 12
  it('rejects board appointment creation by an ordinary student', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: accountId,

      role: 'STUDENT',

      status: 'ACTIVE',
    });

    await expect(
      service.create(
        clubId,

        appointmentDto(),

        accountId,
      ),
    ).rejects.toThrow(
      ForbiddenException,
    );

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });

  // TEST 13
  it('rejects board appointment creation for an archived club', async () => {
    prisma.club.findUnique.mockResolvedValue({
      id: clubId,

      status: 'ARCHIVED',
    });

    await expect(
      service.create(
        clubId,

        appointmentDto(),

        deanshipId,
      ),
    ).rejects.toThrow(
      ConflictException,
    );

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });

  // TEST 14
  it('prevents an appointment from conflicting with a live nomination', async () => {
    prisma.boardNomination.findMany.mockResolvedValue([
      {
        studentId: 'different-student',

        position: 'President',
      },
    ]);

    await expect(
      service.create(
        clubId,

        appointmentDto('President'),

        deanshipId,
      ),
    ).rejects.toMatchObject({
      status: 409,

      response: {
        code: 'BOARD_NOMINATION_OVERLAP',
      },
    });

    expect(
      prisma.boardAppointment.create,
    ).not.toHaveBeenCalled();
  });
});