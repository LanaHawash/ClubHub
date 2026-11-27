import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../src/shared/prisma/prisma.service';

import { ClubsService } from '../src/modules/clubs/clubs.service';

import { ClubEligibilityService } from '../src/modules/clubs/club-eligibility.service';

import { MembershipApplicationsService } from '../src/modules/membership-applications/membership-applications.service';

import { CreateClubDto } from '../src/modules/clubs/dto/create-club.dto';

import { PaymentsService } from '../src/modules/payments/payments.service';
import {
  ClubAdminAssignmentsService,
} from '../src/modules/clubs/club-admin-assignments.service';

import {
  PaymentConfirmationService,
} from '../src/modules/payments/payment-confirmation.service';
import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import { UnauthorizedException } from '@nestjs/common';

import {
  OnlinePaymentsService,
} from '../src/modules/payments/online-payments.service';

import {
  PaymentProviderEventsService,
} from '../src/modules/payments/payment-provider-events.service';

import {
  SimulatedPaymentProvider,
} from '../src/modules/payments/providers/simulated-payment.provider';

import type {
  ProviderPaymentOutcome,
} from '../src/modules/payments/providers/payment-provider.interface';
import {
  createHmac,
} from 'node:crypto';

import {
  PaymentSimulationService,
} from '../src/modules/payments/payment-simulation.service';
import {
  MembershipLifecycleService,
} from '../src/modules/membership-applications/membership-lifecycle.service';

import {
  validateNewBoardTerm,
  resolveBoardCoveragePeriod,
  parseBoardDate,
} from '../src/shared/membership/board-term';

import {
  evaluateBoardMembershipCoverage,
} from '../src/shared/membership/board-membership-coverage';
import {
  BoardAppointmentsService,
} from '../src/modules/clubs/board-appointments.service';

import {
  getLocalBoardDate,
  addBoardCalendarDays,
} from '../src/shared/membership/board-term';

describe('Sprint 6.C - Membership applications integration', () => {
  let prisma: PrismaService;
  let clubsService: ClubsService;
  let applicationsService: MembershipApplicationsService;
  let paymentsService: PaymentsService;
  let onlinePaymentsService: OnlinePaymentsService;

  let providerEventsService: PaymentProviderEventsService;

  let simulatedProvider: SimulatedPaymentProvider;

  const MINUTE_MS = 60 * 1000; 
  const DAY_MS = 24 * 60 * 60 * 1000;

  function uniqueSuffix(): string {
    return randomUUID().slice(0, 12);
  }

  async function createStudent() {
    const suffix = uniqueSuffix();

    const faculty = await prisma.faculty.create({
      data: {
        name: `S6 Faculty ${suffix}`,
      },
    });

    const major = await prisma.major.create({
      data: {
        name: `S6 Major ${suffix}`,
        facultyId: faculty.id,
      },
    });

    const student = await prisma.universityStudent.create({
      data: {
        universityId: `S6${suffix.replace(/-/g, '')}`,
        email: `s6-${suffix}@example.com`,
        fullName: 'Sprint 6 Test Student',
        majorId: major.id,
      },
    });

    const account = await prisma.account.create({
      data: {
        email: student.email,
        passwordHash: 'integration-test-only',
        role: 'STUDENT',
        status: 'ACTIVE',
        universityStudentId: student.id,
      },
    });

    return {
      faculty,
      major,
      student,
      account,
    };
  }

  async function createClub(
    registrationMode:
      | 'ALWAYS_OPEN'
      | 'WINDOWED' = 'ALWAYS_OPEN',
    overrides: Partial<CreateClubDto> = {},
  ) {
    const suffix = uniqueSuffix();

    const dto: CreateClubDto = {
      name: `S6 Club ${suffix}`,
      description: 'Sprint 6 integration test club',
      contactEmail: `club-${suffix}@example.com`,
      classification: 'GENERAL',
      labelIds: [],
      newLabels: [],
      boardMembers: [],
      administrators: [],

      membership: {
        firstTimeFee: '30.00',
        renewalFee: '20.00',
        currency: 'ILS',
        registrationMode,

        ...(registrationMode === 'WINDOWED'
          ? {
              opensAt: '2099-01-01T00:00:00.000Z',
              closesAt: '2099-02-01T00:00:00.000Z',
            }
          : {}),
      },

      ...overrides,
    };

    return clubsService.create(dto);
  }

  async function createActiveWindow(clubId: string) {
    const window =
      await prisma.clubRegistrationWindow.findFirstOrThrow({
        where: { clubId },
      });

    return prisma.clubRegistrationWindow.update({
      where: { id: window.id },

      data: {
        opensAt: new Date(Date.now() - 60_000),
        closesAt: new Date(
          Date.now() + 60 * 60 * 1000,
        ),
      },
    });
  }

  async function createClubAdministrator(
  clubId: string,
  position: 'PRESIDENT' | 'SECOND_ADMIN' = 'PRESIDENT',
) {
  const { account, student } = await createStudent();

  const deanship = await prisma.account.create({
    data: {
      email: `deanship-${uniqueSuffix()}@example.com`,
      passwordHash: 'integration-test-only',
      role: 'DEANSHIP',
      status: 'ACTIVE',
    },
  });

  const today = new Date();

  const startDate = new Date(
    today.getTime() - DAY_MS,
  );

  const endDate = new Date(
    today.getTime() + 180 * DAY_MS,
  );

  const appointment = await prisma.boardAppointment.create({
    data: {
      clubId,
      studentId: student.id,

      position:
        position === 'PRESIDENT'
          ? 'President'
          : 'Vice President',

      startDate,
      endDate,
    },
  });

  const adminService =
    new ClubAdminAssignmentsService(prisma);

  const assignment = await adminService.assignAdmin(
    clubId,
    {
      boardAppointmentId: appointment.id,
      position,
    },
    deanship.id,
  );

  return {
    account,
    student,
    appointment,
    assignment,
    deanship,
  };
}
async function createAwaitingCashApplication(
  registrationMode:
    | 'ALWAYS_OPEN'
    | 'WINDOWED' = 'ALWAYS_OPEN',
) {
  const club = await createClub(registrationMode);

  const { account, student } = await createStudent();

  if (registrationMode === 'WINDOWED') {
    await createActiveWindow(club.id);
  }

  const { application } =
    await applicationsService.createOrdinaryApplication(
      account.id,
      club.id,
    );

  const { payment } =
    await paymentsService.selectCashPayment(
      account.id,
      application.id,
    );

  return {
    club,
    account,
    student,
    application,
    payment,
  };
}
async function createProcessingOnlinePayment(
  registrationMode:
    | 'ALWAYS_OPEN'
    | 'WINDOWED' = 'ALWAYS_OPEN',
) {
  const club = await createClub(
    registrationMode,
  );

  const { account, student } =
    await createStudent();

  if (registrationMode === 'WINDOWED') {
    await createActiveWindow(club.id);
  }

  const { application } =
    await applicationsService.createOrdinaryApplication(
      account.id,
      club.id,
    );

  const result =
    await onlinePaymentsService.initiateOnlinePayment(
      account.id,
      application.id,
    );

  return {
    club,
    account,
    student,
    application,
    payment: result.payment,
    attempt: result.attempt,
  };
}
async function createOnlineProviderEvent(
  attemptId: string,
  outcome: ProviderPaymentOutcome,
  options: {
    occurredAt?: Date;
    amount?: string;
    failureCode?: string;
  } = {},
) {
  const attempt =
    await prisma.paymentAttempt.findUniqueOrThrow({
      where: {
        id: attemptId,
      },

      include: {
        payment: true,
      },
    });

  if (!attempt.providerAttemptRef) {
    throw new Error(
      'Test attempt has no provider reference.',
    );
  }

  const clock =
    await prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;

  return simulatedProvider.createSignedEvent({
    providerAttemptRef:
      attempt.providerAttemptRef,

    outcome,

    amount:
      options.amount ??
      attempt.payment.amount.toFixed(2),

    currency:
      attempt.payment.currency,

    occurredAt:
      options.occurredAt ??
      clock[0].now,

    failureCode:
      options.failureCode,
  });
}
async function simulateOnlinePaymentDeadline(
  applicationId: string,
  attemptId: string,
  deadlineMinutesAgo: number,
) {
  const clock =
    await prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;

  const now = clock[0].now;

  const deadline = new Date(
    now.getTime() -
      deadlineMinutesAgo * MINUTE_MS,
  );

  const initiatedAt = new Date(
    deadline.getTime() -
      5 * MINUTE_MS,
  );

  const submittedAt = new Date(
    deadline.getTime() -
      14 * DAY_MS,
  );

  const graceEndsAt = new Date(
    deadline.getTime() +
      30 * MINUTE_MS,
  );

  await prisma.$transaction([
    prisma.membershipApplication.update({
      where: {
        id: applicationId,
      },

      data: {
        submittedAt,

        paymentDeadlineAt: deadline,

        originalDeadlineAt: deadline,

        processingGraceEndsAt: graceEndsAt,
      },
    }),

    prisma.paymentAttempt.update({
      where: {
        id: attemptId,
      },

      data: {
        initiatedAt,

        nominalDeadlineAt: deadline,

        processingGraceEndsAt: graceEndsAt,
      },
    }),
  ]);

  return {
    now,
    deadline,
    initiatedAt,
    graceEndsAt,
  };
}
  beforeAll(async () => {
  const url = process.env.DATABASE_URL;

  if (
    !url ||
    new URL(url).pathname.replace(/^\//, '') !==
      'clubhub_test'
  ) {
    throw new Error(
      'Safety guard: Sprint 6 integration tests require clubhub_test.',
    );
  }

  // 1. Initialize Prisma first.
  prisma = new PrismaService();

  await prisma.$connect();

  const simulationConfig = new ConfigService({
    SIMULATED_PAYMENT_WEBHOOK_SECRET:
      'integration-test-only-payment-secret-32-characters',
  });

  simulatedProvider =
    new SimulatedPaymentProvider(
      simulationConfig,
    );

  onlinePaymentsService =
    new OnlinePaymentsService(
      prisma,
      new ClubEligibilityService(prisma),
      simulatedProvider,
    );

  providerEventsService =
    new PaymentProviderEventsService(
      prisma,
      new ClubEligibilityService(prisma),
      new PaymentConfirmationService(),
      simulatedProvider,
    );
  // 2. Initialize the existing club service.
  clubsService = new ClubsService(prisma);

  // 3. Initialize the eligibility service.
  const eligibilityService =
    new ClubEligibilityService(prisma);

  // 4. Initialize membership applications.
  applicationsService =
    new MembershipApplicationsService(
      prisma,
      clubsService,
      eligibilityService,
    );

  // 5. Initialize payments only after Prisma is ready.
  paymentsService = new PaymentsService(
  prisma,
  eligibilityService,
  new ClubAdminAssignmentsService(prisma),
  new PaymentConfirmationService(),
);
});


  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // TEST 1
  it('creates a first-time ordinary application with the correct fee', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    const result =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    expect(result.application.clubId).toBe(club.id);

    expect(result.application.studentId).toBe(
      student.id,
    );

    expect(result.application.kind).toBe('ORDINARY');

    expect(result.application.status).toBe(
      'PENDING_PAYMENT',
    );

    expect(result.application.feeType).toBe(
      'FIRST_TIME',
    );

    expect(result.application.quotedAmount).toBe(
      '30.00',
    );

    expect(result.application.currency).toBe('ILS');

    expect(
      result.application.feeVersionId,
    ).toBeTruthy();
  });

  // TEST 2
  it('sets an always-open deadline exactly 14 days after submission', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    expect(
      application.paymentDeadlineAt.getTime() -
        application.submittedAt.getTime(),
    ).toBe(14 * DAY_MS);

    expect(application.originalDeadlineAt).toEqual(
      application.paymentDeadlineAt,
    );

    expect(
      application.registrationModeAtSubmission,
    ).toBe('ALWAYS_OPEN');

    expect(
      application.registrationWindowId,
    ).toBeNull();
  });

  // TEST 3
  it('rejects a second live application for the same student and club', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    await applicationsService.createOrdinaryApplication(
      account.id,
      club.id,
    );

    await expect(
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const count =
      await prisma.membershipApplication.count({
        where: {
          clubId: club.id,
          studentId: student.id,
        },
      });

    expect(count).toBe(1);
  });

  // TEST 4
  it('allows exactly one of two concurrent application requests', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    const results = await Promise.allSettled([
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),

      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ]);

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (result) => result.status === 'rejected',
    );

    expect(successful).toHaveLength(1);

    expect(rejected).toHaveLength(1);

    const count =
      await prisma.membershipApplication.count({
        where: {
          clubId: club.id,
          studentId: student.id,
          status: {
            in: [
              'PENDING_PAYMENT',
              'PAYMENT_PROCESSING',
            ],
          },
        },
      });

    expect(count).toBe(1);
  });

  // TEST 5
  it('uses renewal pricing when a previous membership has expired', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    await prisma.membership.create({
      data: {
        clubId: club.id,
        studentId: student.id,

        activatedAt: new Date(
          '2024-01-01T00:00:00.000Z',
        ),

        expiresAt: new Date(
          '2025-01-01T00:00:00.000Z',
        ),
      },
    });

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    expect(application.feeType).toBe('RENEWAL');

    expect(application.quotedAmount).toBe('20.00');
  });

  // TEST 6
  it('rejects applications from existing active members', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    await prisma.membership.create({
      data: {
        clubId: club.id,
        studentId: student.id,

        activatedAt: new Date(
          Date.now() - DAY_MS,
        ),

        expiresAt: new Date(
          Date.now() + 364 * DAY_MS,
        ),
      },
    });

    await expect(
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // TEST 7
  it('rejects applications to archived clubs', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    await clubsService.archive(club.id);

    await expect(
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // TEST 8
  it('rejects applications before a scheduled window opens', async () => {
    const club = await createClub('WINDOWED');

    const { account } = await createStudent();

    await expect(
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // TEST 9
  it('uses the locked fee version and closing deadline of an active registration window', async () => {
    const club = await createClub('WINDOWED');

    const { account } = await createStudent();

    const window = await createActiveWindow(
      club.id,
    );

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const storedWindow =
      await prisma.clubRegistrationWindow.findUniqueOrThrow({
        where: { id: window.id },
      });

    expect(
      application.registrationModeAtSubmission,
    ).toBe('WINDOWED');

    expect(
      application.registrationWindowId,
    ).toBe(window.id);

    expect(
      application.paymentDeadlineAt,
    ).toEqual(window.closesAt);

    expect(application.feeVersionId).toBe(
      storedWindow.effectiveFeeVersionId,
    );

    expect(application.quotedAmount).toBe('30.00');
  });

  // TEST 10
  it('preserves the application quote when a later fee version exists', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    await prisma.clubMembershipFeeVersion.create({
      data: {
        clubId: club.id,
        firstTimeFee: '55.00',
        renewalFee: '45.00',
        currency: 'ILS',

        effectiveAt: new Date(
          application.submittedAt.getTime() +
            60_000,
        ),
      },
    });

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    expect(stored.quotedAmount.toFixed(2)).toBe(
      '30.00',
    );

    expect(stored.feeVersionId).toBe(
      application.feeVersionId,
    );
  });

  // TEST 11
  it('rejects a student outside the allowed faculty', async () => {
    const { account } = await createStudent();

    const otherFaculty = await prisma.faculty.create({
      data: {
        name: `Restricted Faculty ${uniqueSuffix()}`,
      },
    });

    const club = await createClub('ALWAYS_OPEN', {
      classification: 'FACULTY_BASED',
      facultyId: otherFaculty.id,
    });

    await expect(
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 12
  it('does not create a membership or payment upon application submission', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const memberships =
      await prisma.membership.count({
        where: {
          clubId: club.id,
          studentId: student.id,
        },
      });

    const payments = await prisma.payment.count({
      where: {
        membershipApplicationId: application.id,
      },
    });

    expect(memberships).toBe(0);

    expect(payments).toBe(0);

    expect(application.status).toBe(
      'PENDING_PAYMENT',
    );
  });

  // TEST 13
  it('rejects an account without a valid active student identity', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    await prisma.account.update({
      where: { id: account.id },

      data: {
        status: 'ACTIVE',
        universityStudentId: null,
      },
    });

    await expect(
      applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('offers APPLY before the student submits an application', async () => {
  const club = await createClub();

  const { account } = await createStudent();

  const quote =
    await clubsService.getMembershipQuoteForAccount(
      account.id,
      club.id,
      true,
    );

  expect(quote.action).toBe('APPLY');

  expect(quote.canApply).toBe(true);

  expect(quote.hasPendingApplication).toBe(false);

  expect(quote.pendingApplication).toBeNull();
});

it('changes the student action to CONTINUE_PAYMENT after submission', async () => {
  const club = await createClub();

  const { account } = await createStudent();

  const { application } =
    await applicationsService.createOrdinaryApplication(
      account.id,
      club.id,
    );

  const quote =
    await clubsService.getMembershipQuoteForAccount(
      account.id,
      club.id,
      true,
    );

  expect(quote.action).toBe('CONTINUE_PAYMENT');

  expect(quote.canApply).toBe(false);

  expect(quote.hasPendingApplication).toBe(true);

  expect(quote.pendingApplication?.id).toBe(
    application.id,
  );

  expect(
    quote.pendingApplication?.quotedAmount,
  ).toBe('30.00');
});

it('does not expose another student pending application', async () => {
  const club = await createClub();

  const first = await createStudent();

  const second = await createStudent();

  await applicationsService.createOrdinaryApplication(
    first.account.id,
    club.id,
  );

  const quote =
    await clubsService.getMembershipQuoteForAccount(
      second.account.id,
      club.id,
      true,
    );

  expect(quote.action).toBe('APPLY');

  expect(quote.hasPendingApplication).toBe(false);

  expect(quote.pendingApplication).toBeNull();
});

it('shows membership details for an active member', async () => {
  const club = await createClub();

  const { student, account } =
    await createStudent();

  const membership = await prisma.membership.create({
    data: {
      clubId: club.id,
      studentId: student.id,

      activatedAt: new Date(
        Date.now() - DAY_MS,
      ),

      expiresAt: new Date(
        Date.now() + 364 * DAY_MS,
      ),
    },
  });

  const quote =
    await clubsService.getMembershipQuoteForAccount(
      account.id,
      club.id,
      true,
    );

  expect(quote.action).toBe('ACTIVE_MEMBER');

  expect(quote.canApply).toBe(false);

  expect(quote.alreadyActiveMember).toBe(true);

  expect(quote.activeMembership?.id).toBe(
    membership.id,
  );

  expect(
    quote.activeMembership?.membershipNumber,
  ).toMatch(/^CH-\d{4}-\d{6,}$/);
});
describe('Sprint 6.D - Cash payment selection', () => {
  it('creates an awaiting-cash payment using the frozen application quote', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const result =
      await paymentsService.selectCashPayment(
        account.id,
        application.id,
      );

    expect(result.payment.method).toBe(
      'IN_PERSON',
    );

    expect(result.payment.provider).toBe(
      'MANUAL',
    );

    expect(result.payment.status).toBe(
      'AWAITING_CASH',
    );

    expect(result.payment.amount).toBe(
      '30.00',
    );

    expect(result.payment.currency).toBe(
      'ILS',
    );

    expect(
      result.payment.membershipApplicationId,
    ).toBe(application.id);

    expect(result.payment.confirmedAt).toBeNull();

    expect(
      result.payment.confirmedByAccountId,
    ).toBeNull();

    const memberships =
      await prisma.membership.count({
        where: {
          clubId: club.id,
          studentId: student.id,
        },
      });

    expect(memberships).toBe(0);
  });

  it('returns the existing cash payment when selection is repeated', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const first =
      await paymentsService.selectCashPayment(
        account.id,
        application.id,
      );

    const second =
      await paymentsService.selectCashPayment(
        account.id,
        application.id,
      );

    expect(first.payment.id).toBe(
      second.payment.id,
    );

    const count =
      await prisma.payment.count({
        where: {
          membershipApplicationId:
            application.id,
        },
      });

    expect(count).toBe(1);
  });

  it('prevents duplicate cash payments during concurrent selection', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const [first, second] =
      await Promise.all([
        paymentsService.selectCashPayment(
          account.id,
          application.id,
        ),

        paymentsService.selectCashPayment(
          account.id,
          application.id,
        ),
      ]);

    expect(first.payment.id).toBe(
      second.payment.id,
    );

    const count =
      await prisma.payment.count({
        where: {
          membershipApplicationId:
            application.id,
        },
      });

    expect(count).toBe(1);
  });

  it('prevents another student from selecting payment for the application', async () => {
    const club = await createClub();

    const first = await createStudent();

    const second = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        first.account.id,
        club.id,
      );

    await expect(
      paymentsService.selectCashPayment(
        second.account.id,
        application.id,
      ),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects cash selection after the payment deadline', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    await prisma.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        submittedAt: new Date(
          Date.now() - 15 * DAY_MS,
        ),

        paymentDeadlineAt: new Date(
          Date.now() - DAY_MS,
        ),

        originalDeadlineAt: new Date(
          Date.now() - DAY_MS,
        ),
      },
    });

    await expect(
      paymentsService.selectCashPayment(
        account.id,
        application.id,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects cash payment selection after the club is archived', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    await clubsService.archive(club.id);

    await expect(
      paymentsService.selectCashPayment(
        account.id,
        application.id,
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('changes the student membership action to AWAITING_CASH', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const { payment } =
      await paymentsService.selectCashPayment(
        account.id,
        application.id,
      );

    const quote =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(quote.action).toBe(
      'AWAITING_CASH',
    );

    expect(quote.canApply).toBe(false);

    expect(
      quote.pendingApplication?.paymentId,
    ).toBe(payment.id);

    expect(
      quote.pendingApplication?.paymentMethod,
    ).toBe('IN_PERSON');

    expect(
      quote.pendingApplication?.paymentStatus,
    ).toBe('AWAITING_CASH');
  });
});
describe('Sprint 6.D - Cash payment confirmation', () => {
  // TEST 1
  it('atomically confirms cash payment and activates membership', async () => {
    const {
      club,
      student,
      application,
      payment,
    } = await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const result =
      await paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      );

    expect(result.payment.status).toBe('CONFIRMED');

    expect(result.application.status).toBe('PAID');

    expect(result.alreadyConfirmed).toBe(false);

    expect(result.payment.confirmedByAccountId).toBe(
      administrator.account.id,
    );

    expect(result.payment.confirmedAt).not.toBeNull();

    expect(result.membership.clubId).toBe(club.id);

    expect(result.membership.studentId).toBe(
      student.id,
    );

    expect(result.membership.sourceApplicationId).toBe(
      application.id,
    );

    expect(result.membership.sourcePaymentId).toBe(
      payment.id,
    );

    expect(result.membership.membershipNumber).toMatch(
      /^CH-\d{4}-\d{6,}$/,
    );

    expect(result.membership.activatedAt).toEqual(
      result.payment.confirmedAt,
    );

    expect(result.membership.confirmedPaymentAt).toEqual(
      result.payment.confirmedAt,
    );

    expect(result.application.paidAt).toEqual(
      result.payment.confirmedAt,
    );

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedApplication.status).toBe('PAID');

    expect(storedPayment.status).toBe('CONFIRMED');

    const memberships = await prisma.membership.count({
      where: {
        sourceApplicationId: application.id,
      },
    });

    expect(memberships).toBe(1);
  });

  // TEST 2
  it('activates membership for exactly one calendar year', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const { membership } =
      await paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      );

    const expectedExpiration = new Date(
      membership.activatedAt.getTime(),
    );

    const originalMonth =
      expectedExpiration.getUTCMonth();

    expectedExpiration.setUTCFullYear(
      expectedExpiration.getUTCFullYear() + 1,
    );

    if (
      expectedExpiration.getUTCMonth() !== originalMonth
    ) {
      expectedExpiration.setUTCDate(0);
    }

    expect(membership.expiresAt).toEqual(
      expectedExpiration,
    );
  });

  // TEST 3
  it('makes repeated cash confirmation idempotent', async () => {
    const { club, payment, application } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const first =
      await paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      );

    const second =
      await paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      );

    expect(first.alreadyConfirmed).toBe(false);

    expect(second.alreadyConfirmed).toBe(true);

    expect(second.membership.id).toBe(
      first.membership.id,
    );

    expect(second.membership.membershipNumber).toBe(
      first.membership.membershipNumber,
    );

    expect(second.membership.activatedAt).toEqual(
      first.membership.activatedAt,
    );

    expect(second.payment.confirmedAt).toEqual(
      first.payment.confirmedAt,
    );

    const count = await prisma.membership.count({
      where: {
        sourceApplicationId: application.id,
      },
    });

    expect(count).toBe(1);
  });

  // TEST 4
  it('preserves the first confirming administrator', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const president =
      await createClubAdministrator(
        club.id,
        'PRESIDENT',
      );

    const secondAdmin =
      await createClubAdministrator(
        club.id,
        'SECOND_ADMIN',
      );

    const first =
      await paymentsService.confirmCashPayment(
        president.account.id,
        club.id,
        payment.id,
      );

    const second =
      await paymentsService.confirmCashPayment(
        secondAdmin.account.id,
        club.id,
        payment.id,
      );

    expect(second.alreadyConfirmed).toBe(true);

    expect(second.payment.confirmedByAccountId).toBe(
      president.account.id,
    );

    expect(second.payment.confirmedAt).toEqual(
      first.payment.confirmedAt,
    );
  });

  // TEST 5
  it('prevents duplicate activation during concurrent administrator confirmations', async () => {
    const { club, payment, application } =
      await createAwaitingCashApplication();

    const president =
      await createClubAdministrator(
        club.id,
        'PRESIDENT',
      );

    const secondAdmin =
      await createClubAdministrator(
        club.id,
        'SECOND_ADMIN',
      );

    const results = await Promise.all([
      paymentsService.confirmCashPayment(
        president.account.id,
        club.id,
        payment.id,
      ),

      paymentsService.confirmCashPayment(
        secondAdmin.account.id,
        club.id,
        payment.id,
      ),
    ]);

    expect(results[0].membership.id).toBe(
      results[1].membership.id,
    );

    expect(
      results.filter(
        (result) => !result.alreadyConfirmed,
      ),
    ).toHaveLength(1);

    expect(
      results.filter(
        (result) => result.alreadyConfirmed,
      ),
    ).toHaveLength(1);

    expect(
      results[0].payment.confirmedByAccountId,
    ).toBe(
      results[1].payment.confirmedByAccountId,
    );

    const storedMemberships =
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(storedMemberships).toBe(1);
  });

  // TEST 6
  it('prevents an ordinary student from confirming their own payment', async () => {
    const { club, payment, account } =
      await createAwaitingCashApplication();

    await expect(
      paymentsService.confirmCashPayment(
        account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedPayment.status).toBe(
      'AWAITING_CASH',
    );
  });

  // TEST 7
  it('rejects cash confirmation by an administrator of another club', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const otherClub = await createClub();

    const otherAdministrator =
      await createClubAdministrator(otherClub.id);

    await expect(
      paymentsService.confirmCashPayment(
        otherAdministrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 8
  it('prevents an administrator from confirming another club payment through their own club endpoint', async () => {
    const { payment } =
      await createAwaitingCashApplication();

    const otherClub = await createClub();

    const administrator =
      await createClubAdministrator(otherClub.id);

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        otherClub.id,
        payment.id,
      ),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  // TEST 9
  it('rejects ordinary cash confirmation by Deanship', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    await expect(
      paymentsService.confirmCashPayment(
        administrator.deanship.id,
        club.id,
        payment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 10
  it('rejects confirmation by a revoked administrator', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const adminService =
      new ClubAdminAssignmentsService(prisma);

    await adminService.revokeAdmin(
      club.id,
      administrator.assignment.id,
      administrator.deanship.id,
    );

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 11
  it('rejects confirmation after the administrator board term has ended', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    await prisma.boardAppointment.update({
      where: {
        id: administrator.appointment.id,
      },

      data: {
        endedAt: new Date(),
      },
    });

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 12
  it('rejects cash confirmation after the application deadline without grace', async () => {
    const { club, payment, application } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const now = Date.now();

    const deadline = new Date(
      now - 60_000,
    );

    await prisma.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        submittedAt: new Date(
          deadline.getTime() - 14 * DAY_MS,
        ),

        paymentDeadlineAt: deadline,

        originalDeadlineAt: deadline,
      },
    });

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toMatchObject({
      status: 409,

      response: {
        code: 'APPLICATION_DEADLINE_PASSED',
      },
    });

    const membershipCount =
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(membershipCount).toBe(0);
  });

  // TEST 13
  it('rejects cash confirmation for an archived club', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    await clubsService.archive(club.id);

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 14
  it('rejects confirmation when the payment amount does not match the frozen quote', async () => {
    const { club, payment, application } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    await prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        amount: '1.00',
      },
    });

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toMatchObject({
      status: 409,

      response: {
        code: 'PAYMENT_AMOUNT_MISMATCH',
      },
    });

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    expect(storedApplication.status).toBe(
      'PENDING_PAYMENT',
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedPayment.status).toBe(
      'AWAITING_CASH',
    );
  });

  // TEST 15
  it('rolls back payment and application updates if final membership creation fails', async () => {
    const { club, payment, application } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const confirmationService =
      new PaymentConfirmationService();

    const failingPaymentsService =
      new PaymentsService(
        prisma,
        new ClubEligibilityService(prisma),
        new ClubAdminAssignmentsService(prisma),
        confirmationService,
      );

    const original =
      confirmationService.confirmOrdinaryPayment.bind(
        confirmationService,
      );

    const spy = jest
      .spyOn(
        confirmationService,
        'confirmOrdinaryPayment',
      )
      .mockImplementationOnce(async (tx, input) => {
        const createSpy = jest
          .spyOn(tx.membership, 'create')
          .mockRejectedValueOnce(
            new Error(
              'Simulated membership creation failure',
            ),
          );

        try {
          return await original(tx, input);
        } finally {
          createSpy.mockRestore();
        }
      });

    try {
      await expect(
        failingPaymentsService.confirmCashPayment(
          administrator.account.id,
          club.id,
          payment.id,
        ),
      ).rejects.toThrow(
        'Simulated membership creation failure',
      );
    } finally {
      spy.mockRestore();
    }

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    const membershipCount =
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(storedPayment.status).toBe(
      'AWAITING_CASH',
    );

    expect(storedPayment.confirmedAt).toBeNull();

    expect(
      storedPayment.confirmedByAccountId,
    ).toBeNull();

    expect(storedApplication.status).toBe(
      'PENDING_PAYMENT',
    );

    expect(storedApplication.paidAt).toBeNull();

    expect(membershipCount).toBe(0);
  });

  // TEST 16
  it('changes the student action from AWAITING_CASH to ACTIVE_MEMBER', async () => {
    const {
      club,
      account,
      payment,
    } = await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const before =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(before.action).toBe('AWAITING_CASH');

    const confirmed =
      await paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      );

    const after =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(after.action).toBe('ACTIVE_MEMBER');

    expect(after.canApply).toBe(false);

    expect(after.hasPendingApplication).toBe(false);

    expect(after.pendingApplication).toBeNull();

    expect(after.alreadyActiveMember).toBe(true);

    expect(after.activeMembership?.id).toBe(
      confirmed.membership.id,
    );

    expect(
      after.activeMembership?.membershipNumber,
    ).toBe(
      confirmed.membership.membershipNumber,
    );
  });

  // TEST 17
  it('lists pending cash payments for the authorized club only', async () => {
    const first =
      await createAwaitingCashApplication();

    const second =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(first.club.id);

    const result =
      await paymentsService.getPendingCashPayments(
        administrator.account.id,
        first.club.id,
      );

    expect(result.total).toBe(1);

    expect(result.payments[0].paymentId).toBe(
      first.payment.id,
    );

    expect(result.payments[0].amount).toBe(
      '30.00',
    );

    expect(
      result.payments.some(
        (item) =>
          item.paymentId === second.payment.id,
      ),
    ).toBe(false);
  });

  // TEST 18
  it('removes confirmed payments from the pending cash payment list', async () => {
    const { club, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    const before =
      await paymentsService.getPendingCashPayments(
        administrator.account.id,
        club.id,
      );

    expect(before.total).toBe(1);

    await paymentsService.confirmCashPayment(
      administrator.account.id,
      club.id,
      payment.id,
    );

    const after =
      await paymentsService.getPendingCashPayments(
        administrator.account.id,
        club.id,
      );

    expect(after.total).toBe(0);

    expect(after.payments).toEqual([]);
  });

  // TEST 19
  it('rejects access to the pending cash list by an ordinary student', async () => {
    const { club, account } =
      await createAwaitingCashApplication();

    await expect(
      paymentsService.getPendingCashPayments(
        account.id,
        club.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TEST 20
  it('generates different membership numbers for different memberships', async () => {
    const first =
      await createAwaitingCashApplication();

    const second =
      await createAwaitingCashApplication();

    const firstAdmin =
      await createClubAdministrator(first.club.id);

    const secondAdmin =
      await createClubAdministrator(second.club.id);

    const [firstResult, secondResult] =
      await Promise.all([
        paymentsService.confirmCashPayment(
          firstAdmin.account.id,
          first.club.id,
          first.payment.id,
        ),

        paymentsService.confirmCashPayment(
          secondAdmin.account.id,
          second.club.id,
          second.payment.id,
        ),
      ]);

    expect(
      firstResult.membership.membershipNumber,
    ).not.toBe(
      secondResult.membership.membershipNumber,
    );
  });
});
describe('Sprint 6.E - Online payments', () => {

  // TEST 1
  it('initiates online payment using the frozen application quote', async () => {
    const {
      application,
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    expect(payment.method).toBe('ONLINE');

    expect(payment.provider).toBe('SIMULATED');

    expect(payment.status).toBe('PROCESSING');

    expect(payment.amount).toBe('30.00');

    expect(payment.currency).toBe('ILS');

    expect(attempt.status).toBe('PROCESSING');

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    expect(storedApplication.status).toBe(
      'PAYMENT_PROCESSING',
    );

    expect(
      storedApplication.processingGraceEndsAt,
    ).not.toBeNull();

    const memberships =
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(memberships).toBe(0);
  });

  // TEST 2
  it('returns the existing attempt when online initiation is repeated', async () => {
    const {
      account,
      application,
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    const repeated =
      await onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      );

    expect(repeated.existingAttempt).toBe(true);

    expect(repeated.payment.id).toBe(
      payment.id,
    );

    expect(repeated.attempt.id).toBe(
      attempt.id,
    );

    expect(
      await prisma.paymentAttempt.count({
        where: {
          paymentId: payment.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 3
  it('prevents duplicate attempts during concurrent online initiation', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const results = await Promise.all([
      onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      ),

      onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      ),
    ]);

    expect(results[0].payment.id).toBe(
      results[1].payment.id,
    );

    expect(results[0].attempt.id).toBe(
      results[1].attempt.id,
    );

    expect(
      results.filter(
        result => !result.existingAttempt,
      ),
    ).toHaveLength(1);

    expect(
      await prisma.paymentAttempt.count({
        where: {
          paymentId: results[0].payment.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 4
  it('prevents another student from initiating online payment', async () => {
    const { application } =
      await createProcessingOnlinePayment();

    const anotherStudent =
      await createStudent();

    await expect(
      onlinePaymentsService.initiateOnlinePayment(
        anotherStudent.account.id,
        application.id,
      ),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  // TEST 5
  it('rejects online initiation while cash payment is awaiting confirmation', async () => {
    const {
      account,
      application,
    } = await createAwaitingCashApplication();

    await expect(
      onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      ),
    ).rejects.toMatchObject({
      status: 409,

      response: {
        code: 'PAYMENT_METHOD_ALREADY_SELECTED',
      },
    });
  });

  // TEST 6
  it('activates membership after a verified successful online payment', async () => {
    const {
      club,
      student,
      payment,
      application,
      attempt,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      );

    await providerEventsService.processSignedEvent(
      event,
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });

    const membership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(storedPayment.status).toBe(
      'CONFIRMED',
    );

    expect(storedApplication.status).toBe(
      'PAID',
    );

    expect(storedAttempt.status).toBe(
      'SUCCEEDED',
    );

    expect(membership.clubId).toBe(
      club.id,
    );

    expect(membership.studentId).toBe(
      student.id,
    );

    expect(membership.sourcePaymentId).toBe(
      payment.id,
    );

    expect(membership.membershipNumber).toMatch(
      /^CH-\d{4}-\d{6,}$/,
    );
  });

  // TEST 7
  it('records the verified provider timestamp as payment confirmation time', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      );

    const verified =
      simulatedProvider.verifyEvent(event);

    await providerEventsService.processSignedEvent(
      event,
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    const membership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(storedPayment.confirmedAt).toEqual(
      verified.occurredAt,
    );

    expect(membership.activatedAt).toEqual(
      verified.occurredAt,
    );

    expect(membership.confirmedPaymentAt).toEqual(
      verified.occurredAt,
    );
  });

  // TEST 8
  it('does not record a human administrator as the online payment confirmer', async () => {
    const {
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      );

    await providerEventsService.processSignedEvent(
      event,
    );

    const stored =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(stored.status).toBe('CONFIRMED');

    expect(stored.confirmedByAccountId).toBeNull();
  });

  // TEST 9
  it('rejects callbacks with invalid provider signatures', async () => {
    const {
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      );

    await expect(
      providerEventsService.processSignedEvent({
        ...event,

        signature: '0'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.paymentProviderEvent.count({
        where: {
          paymentAttemptId: attempt.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 10
  it('rejects a correctly signed event containing an incorrect payment amount', async () => {
    const {
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
        {
          amount: '1.00',
        },
      );

    await expect(
      providerEventsService.processSignedEvent(
        event,
      ),
    ).rejects.toMatchObject({
      status: 409,

      response: {
        code: 'PAYMENT_AMOUNT_MISMATCH',
      },
    });

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 11
  it('deduplicates repeated delivery of the same provider event', async () => {
    const {
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      );

    const first =
      await providerEventsService.processSignedEvent(
        event,
      );

    const second =
      await providerEventsService.processSignedEvent(
        event,
      );

    expect(first.duplicate).toBe(false);

    expect(second.duplicate).toBe(true);

    expect(
      await prisma.paymentProviderEvent.count({
        where: {
          paymentAttemptId: attempt.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 12
  it('handles concurrent delivery of the same successful callback', async () => {
    const {
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      );

    const results = await Promise.all([
      providerEventsService.processSignedEvent(
        event,
      ),

      providerEventsService.processSignedEvent(
        event,
      ),
    ]);

    expect(
      results.filter(
        result => result.duplicate,
      ),
    ).toHaveLength(1);

    expect(
      await prisma.paymentProviderEvent.count({
        where: {
          paymentAttemptId: attempt.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 13
  it('returns the original application to pending payment after definitive failure', async () => {
    const {
      application,
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'FAILED',
        {
          failureCode: 'SIMULATED_DECLINE',
        },
      );

    await providerEventsService.processSignedEvent(
      event,
    );

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });

    expect(storedApplication.status).toBe(
      'PENDING_PAYMENT',
    );

    expect(storedPayment.status).toBe(
      'FAILED',
    );

    expect(storedAttempt.status).toBe(
      'FAILED',
    );

    expect(storedAttempt.failureCode).toBe(
      'SIMULATED_DECLINE',
    );

    expect(
      storedApplication.processingGraceEndsAt,
    ).toBeNull();

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 14
  it('creates a new attempt while retaining the original application and payment after failure', async () => {
    const {
      account,
      application,
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    const failedEvent =
      await createOnlineProviderEvent(
        attempt.id,
        'FAILED',
      );

    await providerEventsService.processSignedEvent(
      failedEvent,
    );

    const retry =
      await onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      );

    expect(retry.payment.id).toBe(
      payment.id,
    );

    expect(retry.attempt.id).not.toBe(
      attempt.id,
    );

    expect(retry.payment.amount).toBe(
      '30.00',
    );

    expect(retry.applicationStatus).toBe(
      'PAYMENT_PROCESSING',
    );

    const attempts =
      await prisma.paymentAttempt.findMany({
        where: {
          paymentId: payment.id,
        },
      });

    expect(attempts).toHaveLength(2);

    expect(
      attempts.some(
        item => item.status === 'FAILED',
      ),
    ).toBe(true);

    expect(
      attempts.some(
        item => item.status === 'PROCESSING',
      ),
    ).toBe(true);
  });

  // TEST 15
  it('activates membership after a successful retry', async () => {
    const {
      account,
      application,
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'FAILED',
      ),
    );

    const retry =
      await onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        retry.attempt.id,
        'SUCCEEDED',
      ),
    );

    const membership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          sourceApplicationId: application.id,
        },
      });

    expect(membership.sourcePaymentId).toBe(
      payment.id,
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 16
  it('keeps an unknown provider outcome unresolved and prevents new attempts', async () => {
    const {
      account,
      application,
      payment,
      attempt,
    } = await createProcessingOnlinePayment();

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'UNKNOWN',
      ),
    );

    const repeated =
      await onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      );

    expect(repeated.existingAttempt).toBe(true);

    expect(repeated.attempt.id).toBe(
      attempt.id,
    );

    expect(repeated.attempt.status).toBe(
      'UNKNOWN',
    );

    expect(
      await prisma.paymentAttempt.count({
        where: {
          paymentId: payment.id,
        },
      }),
    ).toBe(1);

    await expect(
      paymentsService.selectCashPayment(
        account.id,
        application.id,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // TEST 17
  it('allows an unknown attempt to resolve successfully through a verified event', async () => {
    const {
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'UNKNOWN',
      ),
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });

    expect(storedAttempt.status).toBe(
      'SUCCEEDED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 18
  it('sets the online processing grace cutoff exactly 30 minutes after the nominal deadline', async () => {
    const {
      application,
      attempt,
    } = await createProcessingOnlinePayment();

    expect(
      attempt.processingGraceEndsAt.getTime() -
      attempt.nominalDeadlineAt.getTime(),
    ).toBe(30 * MINUTE_MS);

    expect(
      attempt.nominalDeadlineAt,
    ).toEqual(
      application.paymentDeadlineAt,
    );
  });

  // TEST 19
  it('accepts a verified online success occurring within the grace period', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        10,
      );

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
        {
          occurredAt: timing.now,
        },
      );

    await providerEventsService.processSignedEvent(
      event,
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedPayment.status).toBe(
      'CONFIRMED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 20
  it('accepts an in-time provider success delivered after the grace cutoff while the attempt remains unresolved', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    const occurredAt = new Date(
      timing.graceEndsAt.getTime() -
        MINUTE_MS,
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
        {
          occurredAt,
        },
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedPayment.status).toBe(
      'CONFIRMED',
    );

    expect(storedPayment.confirmedAt).toEqual(
      occurredAt,
    );
  });

  // TEST 21
  it('marks a success occurring after the grace cutoff as refund required', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
        {
          occurredAt: timing.now,
        },
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });

    expect(storedPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(storedAttempt.status).toBe(
      'LATE_SUCCESS_REFUND_REQUIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);

    const ledgerEvent =
      await prisma.paymentProviderEvent.findFirstOrThrow({
        where: {
          paymentAttemptId: attempt.id,
        },
      });

    expect(ledgerEvent.status).toBe(
      'RECONCILIATION_REQUIRED',
    );
  });

  // TEST 22
  it('rejects membership activation when success occurs exactly at the exclusive grace cutoff', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
        {
          occurredAt:
            timing.graceEndsAt,
        },
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 23
  it('prevents retry after a definitive failure received after the application deadline', async () => {
    const {
      account,
      application,
      attempt,
    } = await createProcessingOnlinePayment();

    await simulateOnlinePaymentDeadline(
      application.id,
      attempt.id,
      10,
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'FAILED',
      ),
    );

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });

    expect(storedApplication.status).toBe(
      'EXPIRED',
    );

    await expect(
      onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // TEST 24
  it('changes the student membership action from PAYMENT_PROCESSING to ACTIVE_MEMBER', async () => {
    const {
      club,
      account,
      attempt,
    } = await createProcessingOnlinePayment();

    const before =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(before.action).toBe(
      'PAYMENT_PROCESSING',
    );

    expect(before.canApply).toBe(false);

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    const after =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(after.action).toBe(
      'ACTIVE_MEMBER',
    );

    expect(after.hasPendingApplication).toBe(
      false,
    );

    expect(after.activeMembership).not.toBeNull();
  });

  // TEST 25
  it('requires refund reconciliation when an online payment succeeds after the club is archived', async () => {
    const {
      club,
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    await clubsService.archive(club.id);

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

    expect(storedPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);
  });
});
describe('Sprint 6.E - Payment hardening', () => {
  // TEST 1
  it('prevents an authorized administrator from confirming their own cash payment', async () => {
    const club = await createClub();

    const administrator =
      await createClubAdministrator(club.id);

    const { application } =
      await applicationsService.createOrdinaryApplication(
        administrator.account.id,
        club.id,
      );

    const { payment } =
      await paymentsService.selectCashPayment(
        administrator.account.id,
        application.id,
      );

    await expect(
      paymentsService.confirmCashPayment(
        administrator.account.id,
        club.id,
        payment.id,
      ),
    ).rejects.toMatchObject({
      status: 403,

      response: {
        code: 'SELF_CONFIRMATION_FORBIDDEN',
      },
    });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'AWAITING_CASH',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 2
  it('allows another administrator to confirm an administrator membership payment', async () => {
    const club = await createClub();

    const president =
      await createClubAdministrator(
        club.id,
        'PRESIDENT',
      );

    const secondAdmin =
      await createClubAdministrator(
        club.id,
        'SECOND_ADMIN',
      );

    const { application } =
      await applicationsService.createOrdinaryApplication(
        president.account.id,
        club.id,
      );

    const { payment } =
      await paymentsService.selectCashPayment(
        president.account.id,
        application.id,
      );

    const result =
      await paymentsService.confirmCashPayment(
        secondAdmin.account.id,
        club.id,
        payment.id,
      );

    expect(result.payment.status).toBe(
      'CONFIRMED',
    );

    expect(
      result.payment.confirmedByAccountId,
    ).toBe(secondAdmin.account.id);

    expect(result.membership.studentId).toBe(
      president.student.id,
    );
  });

  // TEST 3
  it('does not reverse a confirmed membership after a later failure event', async () => {
    const {
      payment,
      application,
      attempt,
    } = await createProcessingOnlinePayment();

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'FAILED',
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: {
          id: attempt.id,
        },
      });

    expect(storedPayment.status).toBe(
      'CONFIRMED',
    );

    expect(storedAttempt.status).toBe(
      'SUCCEEDED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 4
  it('isolates a late success from an older failed attempt', async () => {
    const {
      account,
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'FAILED',
      ),
    );

    const retry =
      await onlinePaymentsService.initiateOnlinePayment(
        account.id,
        application.id,
      );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    const oldAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: {
          id: attempt.id,
        },
      });

    const newAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: {
          id: retry.attempt.id,
        },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(oldAttempt.status).toBe(
      'LATE_SUCCESS_REFUND_REQUIRED',
    );

    expect(newAttempt.status).toBe(
      'PROCESSING',
    );

    expect(storedPayment.status).toBe(
      'PROCESSING',
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        retry.attempt.id,
        'SUCCEEDED',
      ),
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 5
  it('rejects the same provider event ID with a different signed payload', async () => {
    const first =
      await createProcessingOnlinePayment();

    const second =
      await createProcessingOnlinePayment();

    const firstEvent =
      await createOnlineProviderEvent(
        first.attempt.id,
        'SUCCEEDED',
      );

    const secondEvent =
      await createOnlineProviderEvent(
        second.attempt.id,
        'SUCCEEDED',
      );

    const firstPayload =
      JSON.parse(firstEvent.payload);

    const secondPayload =
      JSON.parse(secondEvent.payload);

    secondPayload.providerEventId =
      firstPayload.providerEventId;

    const modifiedPayload =
      JSON.stringify(secondPayload);

    const signature = createHmac(
      'sha256',
      'integration-test-only-payment-secret-32-characters',
    )
      .update(modifiedPayload, 'utf8')
      .digest('hex');

    await providerEventsService.processSignedEvent(
      firstEvent,
    );

    await expect(
      providerEventsService.processSignedEvent({
        payload: modifiedPayload,
        signature,
      }),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            second.application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 6
  it('serializes conflicting concurrent provider event identities across clubs', async () => {
    const first =
      await createProcessingOnlinePayment();

    const second =
      await createProcessingOnlinePayment();

    const firstEvent =
      await createOnlineProviderEvent(
        first.attempt.id,
        'SUCCEEDED',
      );

    const secondEvent =
      await createOnlineProviderEvent(
        second.attempt.id,
        'SUCCEEDED',
      );

    const firstPayload =
      JSON.parse(firstEvent.payload);

    const secondPayload =
      JSON.parse(secondEvent.payload);

    secondPayload.providerEventId =
      firstPayload.providerEventId;

    const modifiedPayload =
      JSON.stringify(secondPayload);

    const signature = createHmac(
      'sha256',
      'integration-test-only-payment-secret-32-characters',
    )
      .update(modifiedPayload, 'utf8')
      .digest('hex');

    const results = await Promise.allSettled([
      providerEventsService.processSignedEvent(
        firstEvent,
      ),

      providerEventsService.processSignedEvent({
        payload: modifiedPayload,
        signature,
      }),
    ]);

    const successful = results.filter(
      result => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      result => result.status === 'rejected',
    );

    expect(successful).toHaveLength(1);

    expect(rejected).toHaveLength(1);

    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(
        ConflictException,
      );
    }

    expect(
      await prisma.paymentProviderEvent.count({
        where: {
          provider: 'SIMULATED',

          providerEventId:
            firstPayload.providerEventId,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: {
            in: [
              first.application.id,
              second.application.id,
            ],
          },
        },
      }),
    ).toBe(1);
  });

  // TEST 7
  it('requires refund reconciliation after an early-closure grace cutoff', async () => {
  const club = await createClub('WINDOWED');

  const { account } = await createStudent();

  const scheduledWindow =
    await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: {
        clubId: club.id,
      },
    });

  const clock =
    await prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;

  const now = clock[0].now;

  /*
   * Configure the historical opening time while
   * the registration window is still scheduled.
   *
   * Do not modify opensAt after it becomes active.
   */
  const window =
    await prisma.clubRegistrationWindow.update({
      where: {
        id: scheduledWindow.id,
      },

      data: {
        opensAt: new Date(
          now.getTime() - 120 * MINUTE_MS,
        ),

        closesAt: new Date(
          now.getTime() + 60 * MINUTE_MS,
        ),
      },
    });

  const { application } =
    await applicationsService.createOrdinaryApplication(
      account.id,
      club.id,
    );

  const { payment, attempt } =
    await onlinePaymentsService.initiateOnlinePayment(
      account.id,
      application.id,
    );

  /*
   * Simulate a payment initiated before
   * an early registration closure.
   */
  const historicalSubmission = new Date(
    now.getTime() - 60 * MINUTE_MS,
  );

  const historicalInitiation = new Date(
    now.getTime() - 45 * MINUTE_MS,
  );

  const earlyClosedAt = new Date(
    now.getTime() - 35 * MINUTE_MS,
  );

  const earlyGraceCutoff = new Date(
    earlyClosedAt.getTime() + 30 * MINUTE_MS,
  );

  await prisma.$transaction([
    prisma.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        submittedAt: historicalSubmission,
      },
    }),

    prisma.paymentAttempt.update({
      where: {
        id: attempt.id,
      },

      data: {
        initiatedAt: historicalInitiation,
      },
    }),

    prisma.clubRegistrationWindow.update({
      where: {
        id: window.id,
      },

      data: {
        closedAt: earlyClosedAt,
      },
    }),
  ]);

  const event =
    await createOnlineProviderEvent(
      attempt.id,
      'SUCCEEDED',
      {
        occurredAt: now,
      },
    );

  /*
   * Prove the success is before the original grace
   * cutoff but after the shortened early-closure cutoff.
   */
  expect(now.getTime()).toBeLessThan(
    attempt.processingGraceEndsAt.getTime(),
  );

  expect(now.getTime()).toBeGreaterThanOrEqual(
    earlyGraceCutoff.getTime(),
  );

  await providerEventsService.processSignedEvent(
    event,
  );

  const storedPayment =
    await prisma.payment.findUniqueOrThrow({
      where: {
        id: payment.id,
      },
    });

  const storedAttempt =
    await prisma.paymentAttempt.findUniqueOrThrow({
      where: {
        id: attempt.id,
      },
    });

  const ledgerEvent =
    await prisma.paymentProviderEvent.findFirstOrThrow({
      where: {
        paymentAttemptId: attempt.id,
      },
    });

  expect(storedPayment.status).toBe(
    'REFUND_REQUIRED',
  );

  expect(storedAttempt.status).toBe(
    'LATE_SUCCESS_REFUND_REQUIRED',
  );

  expect(ledgerEvent.status).toBe(
    'RECONCILIATION_REQUIRED',
  );

  expect(
    await prisma.membership.count({
      where: {
        sourceApplicationId: application.id,
      },
    }),
  ).toBe(0);
});

  // TEST 8
  it('allows Deanship to simulate a verified payment in a test environment', async () => {
    const {
      club,
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const administrator =
      await createClubAdministrator(club.id);

    const simulationService =
      new PaymentSimulationService(
        prisma,

        new ConfigService({
          NODE_ENV: 'test',

          ENABLE_PAYMENT_SIMULATION: 'true',
        }),

        simulatedProvider,
        providerEventsService,
      );

    await simulationService.simulateOutcome(
      administrator.deanship.id,
      attempt.id,
      'SUCCEEDED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 9
  it('prevents students from generating simulated payment success', async () => {
    const {
      account,
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const simulationService =
      new PaymentSimulationService(
        prisma,

        new ConfigService({
          NODE_ENV: 'test',

          ENABLE_PAYMENT_SIMULATION: 'true',
        }),

        simulatedProvider,
        providerEventsService,
      );

    await expect(
      simulationService.simulateOutcome(
        account.id,
        attempt.id,
        'SUCCEEDED',
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 10
  it('disables payment simulation in production even when enabled explicitly', async () => {
    const {
      club,
      attempt,
      application,
    } = await createProcessingOnlinePayment();

    const administrator =
      await createClubAdministrator(club.id);

    const simulationService =
      new PaymentSimulationService(
        prisma,

        new ConfigService({
          NODE_ENV: 'production',

          ENABLE_PAYMENT_SIMULATION: 'true',
        }),

        simulatedProvider,
        providerEventsService,
      );

    await expect(
      simulationService.simulateOutcome(
        administrator.deanship.id,
        attempt.id,
        'SUCCEEDED',
      ),
    ).rejects.toMatchObject({
      status: 404,
    });

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });
});
describe('Sprint 6.F - Application lifecycle reconciliation', () => {
  async function makeApplicationOverdue(
    applicationId: string,
  ) {
    const deadline = new Date(
      Date.now() - MINUTE_MS,
    );

    return prisma.membershipApplication.update({
      where: {
        id: applicationId,
      },

      data: {
        submittedAt: new Date(
          deadline.getTime() - 14 * DAY_MS,
        ),

        paymentDeadlineAt: deadline,

        originalDeadlineAt: deadline,
      },
    });
  }

  // TEST 1
  it('preserves an application before its payment deadline', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    const result =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(result?.changed).toBe(false);

    expect(result?.status).toBe(
      'PENDING_PAYMENT',
    );
  });

  // TEST 2
  it('expires an unpaid ordinary application after its deadline', async () => {
    const club = await createClub();

    const { account } = await createStudent();

    const { application } =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    await makeApplicationOverdue(
      application.id,
    );

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    const result =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(result?.changed).toBe(true);

    expect(result?.status).toBe('EXPIRED');

    expect(result?.endReason).toBe('TIMEOUT');

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe('EXPIRED');
  });

  // TEST 3
  it('expires the associated awaiting-cash payment', async () => {
    const { application, payment } =
      await createAwaitingCashApplication();

    await makeApplicationOverdue(
      application.id,
    );

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    await lifecycleService.reconcileApplication(
      application.id,
    );

    const stored =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(stored.status).toBe('EXPIRED');

    expect(stored.confirmedAt).toBeNull();
  });

  // TEST 4
  it('allows a new first-time application after an unpaid application expires', async () => {
    const club = await createClub();

    const { account, student } =
      await createStudent();

    const first =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    await makeApplicationOverdue(
      first.application.id,
    );

    const second =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    expect(second.application.id).not.toBe(
      first.application.id,
    );

    expect(second.application.feeType).toBe(
      'FIRST_TIME',
    );

    const applications =
      await prisma.membershipApplication.findMany({
        where: {
          clubId: club.id,

          studentId: student.id,
        },
      });

    expect(applications).toHaveLength(2);

    expect(
      applications.find(
        item => item.id === first.application.id,
      )?.status,
    ).toBe('EXPIRED');

    expect(
      applications.find(
        item => item.id === second.application.id,
      )?.status,
    ).toBe('PENDING_PAYMENT');
  });

  // TEST 5
  it('preserves an online processing application within its permitted grace period', async () => {
    const { application, attempt, payment } =
      await createProcessingOnlinePayment();

    await simulateOnlinePaymentDeadline(
      application.id,
      attempt.id,
      10,
    );

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    const result =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(result?.changed).toBe(false);

    expect(result?.status).toBe(
      'PAYMENT_PROCESSING',
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'PROCESSING',
    );
  });

  // TEST 6
  it('expires an unresolved online application after the processing grace cutoff', async () => {
    const { application, attempt, payment } =
      await createProcessingOnlinePayment();

    await simulateOnlinePaymentDeadline(
      application.id,
      attempt.id,
      40,
    );

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    const result =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(result?.status).toBe('EXPIRED');

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: {
          id: attempt.id,
        },
      });

    expect(storedPayment.status).toBe(
      'EXPIRED',
    );

    expect(storedAttempt.status).toBe(
      'EXPIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 7
  it('makes repeated expiration reconciliation idempotent', async () => {
    const { application } =
      await createAwaitingCashApplication();

    await makeApplicationOverdue(
      application.id,
    );

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    const first =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    const second =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(first?.changed).toBe(true);

    expect(second?.changed).toBe(false);

    expect(second?.status).toBe('EXPIRED');
  });

  // TEST 8
 it('atomically cancels an unpaid application when the club is archived', async () => {
  const {
    club,
    application,
    payment,
  } = await createAwaitingCashApplication();

  await clubsService.archive(club.id);

  /*
   * No manual reconciliation should be required.
   */
  const storedApplication =
    await prisma.membershipApplication.findUniqueOrThrow({
      where: {
        id: application.id,
      },
    });

  const storedPayment =
    await prisma.payment.findUniqueOrThrow({
      where: {
        id: payment.id,
      },
    });

  expect(storedApplication.status).toBe(
    'CANCELED',
  );

  expect(storedApplication.endReason).toBe(
    'CLUB_ARCHIVED',
  );

  expect(storedApplication.canceledAt).not.toBeNull();

  expect(storedPayment.status).toBe(
    'EXPIRED',
  );
});

  // TEST 9
  it('does not restore a canceled application when the club is reactivated', async () => {
    const { club, application } =
      await createAwaitingCashApplication();

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    await clubsService.archive(club.id);

   

    await clubsService.activate(club.id);

    const result =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(result?.changed).toBe(false);

    expect(result?.status).toBe('CANCELED');
  });

  // TEST 10
  it('never expires an already paid membership application', async () => {
    const { club, application, payment } =
      await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    await paymentsService.confirmCashPayment(
      administrator.account.id,
      club.id,
      payment.id,
    );

    await clubsService.archive(club.id);

    const lifecycleService =
      new MembershipLifecycleService(prisma);

    const result =
      await lifecycleService.reconcileApplication(
        application.id,
      );

    expect(result?.changed).toBe(false);

    expect(result?.status).toBe('PAID');

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId: application.id,
        },
      }),
    ).toBe(1);
  });
});
describe('Sprint 6.F - Administrative lifecycle integration', () => {
  // TEST 1
  it('extends the deadline of an unpaid application without changing its fee snapshot', async () => {
    const {
      club,
      application,
      payment,
    } = await createAwaitingCashApplication(
      'WINDOWED',
    );

    const newDeadline = new Date(
      application.paymentDeadlineAt.getTime() +
        DAY_MS,
    );

    await clubsService.extendRegistrationWindow(
      club.id,
      application.registrationWindowId!,
      newDeadline.toISOString(),
    );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.paymentDeadlineAt).toEqual(
      newDeadline,
    );

    expect(stored.originalDeadlineAt).toEqual(
      application.originalDeadlineAt,
    );

    expect(stored.feeVersionId).toBe(
      application.feeVersionId,
    );

    expect(stored.quotedAmount.toFixed(2)).toBe(
      '30.00',
    );

    expect(stored.status).toBe(
      'PENDING_PAYMENT',
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'AWAITING_CASH',
    );

    expect(storedPayment.amount.toFixed(2)).toBe(
      '30.00',
    );
  });

  // TEST 2
  it('extends a processing online attempt and its grace cutoff', async () => {
    const {
      club,
      application,
      attempt,
    } = await createProcessingOnlinePayment(
      'WINDOWED',
    );

    const newDeadline = new Date(
      application.paymentDeadlineAt.getTime() +
        DAY_MS,
    );

    await clubsService.extendRegistrationWindow(
      club.id,
      application.registrationWindowId!,
      newDeadline.toISOString(),
    );

    const expectedGrace = new Date(
      newDeadline.getTime() +
        30 * MINUTE_MS,
    );

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const storedAttempt =
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: {
          id: attempt.id,
        },
      });

    expect(
      storedApplication.paymentDeadlineAt,
    ).toEqual(newDeadline);

    expect(
      storedApplication.processingGraceEndsAt,
    ).toEqual(expectedGrace);

    expect(
      storedAttempt.nominalDeadlineAt,
    ).toEqual(newDeadline);

    expect(
      storedAttempt.processingGraceEndsAt,
    ).toEqual(expectedGrace);

    expect(storedAttempt.status).toBe(
      'PROCESSING',
    );
  });

  // TEST 3
  it('does not restore an expired application when a registration window is extended', async () => {
    const {
      club,
      application,
    } = await createAwaitingCashApplication(
      'WINDOWED',
    );

    await prisma.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        status: 'EXPIRED',
        endReason: 'TIMEOUT',
      },
    });

    await prisma.payment.updateMany({
      where: {
        membershipApplicationId:
          application.id,
      },

      data: {
        status: 'EXPIRED',
      },
    });

    const newDeadline = new Date(
      application.paymentDeadlineAt.getTime() +
        DAY_MS,
    );

    await clubsService.extendRegistrationWindow(
      club.id,
      application.registrationWindowId!,
      newDeadline.toISOString(),
    );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe('EXPIRED');

    expect(stored.paymentDeadlineAt).toEqual(
      application.paymentDeadlineAt,
    );
  });

  // TEST 4
  it('immediately expires awaiting-cash applications when registration closes early', async () => {
    const {
      club,
      application,
      payment,
    } = await createAwaitingCashApplication(
      'WINDOWED',
    );

    await clubsService.closeRegistrationWindow(
      club.id,
      application.registrationWindowId!,
    );

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedApplication.status).toBe(
      'EXPIRED',
    );

    expect(storedApplication.endReason).toBe(
      'EARLY_WINDOW_CLOSE',
    );

    expect(storedPayment.status).toBe(
      'EXPIRED',
    );
  });

  // TEST 5
  it('preserves a qualifying online attempt with shortened grace after early closure', async () => {
    const {
      club,
      application,
      attempt,
    } = await createProcessingOnlinePayment(
      'WINDOWED',
    );

    /*
     * Ensure initiation is strictly earlier than
     * the closure timestamp, even on fast databases.
     */
    await prisma.paymentAttempt.update({
      where: {
        id: attempt.id,
      },

      data: {
        initiatedAt: new Date(
          attempt.initiatedAt.getTime() - 1,
        ),
      },
    });

    const closedWindow =
      await clubsService.closeRegistrationWindow(
        club.id,
        application.registrationWindowId!,
      );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const expectedGrace = new Date(
      Math.min(
        closedWindow.closedAt!.getTime() +
          30 * MINUTE_MS,

        attempt.processingGraceEndsAt.getTime(),
      ),
    );

    expect(stored.status).toBe(
      'PAYMENT_PROCESSING',
    );

    expect(stored.processingGraceEndsAt).toEqual(
      expectedGrace,
    );
  });

  // TEST 6
  it('accepts verified online success during shortened early-closure grace', async () => {
    const {
      club,
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment(
      'WINDOWED',
    );

    await prisma.paymentAttempt.update({
      where: {
        id: attempt.id,
      },

      data: {
        initiatedAt: new Date(
          attempt.initiatedAt.getTime() - 1,
        ),
      },
    });

    await clubsService.closeRegistrationWindow(
      club.id,
      application.registrationWindowId!,
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'CONFIRMED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 7
  it('cancels pending applications when registration mode changes', async () => {
    const {
      club,
      application,
      payment,
    } = await createAwaitingCashApplication();

    const settings =
      await prisma.clubMembershipSettings.findUniqueOrThrow({
        where: {
          clubId: club.id,
        },
      });

    await clubsService.updateMembershipMode(
      club.id,
      {
        registrationMode: 'WINDOWED',

        configVersion:
          settings.configVersion,
      },
    );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(stored.status).toBe('CANCELED');

    expect(stored.endReason).toBe(
      'POLICY_SWITCH',
    );

    expect(storedPayment.status).toBe(
      'EXPIRED',
    );
  });

  // TEST 8
  it('does not cancel applications when saving an unchanged registration mode', async () => {
    const {
      club,
      application,
    } = await createAwaitingCashApplication();

    const settings =
      await prisma.clubMembershipSettings.findUniqueOrThrow({
        where: {
          clubId: club.id,
        },
      });

    await clubsService.updateMembershipMode(
      club.id,
      {
        registrationMode: 'ALWAYS_OPEN',

        configVersion:
          settings.configVersion,
      },
    );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe(
      'PENDING_PAYMENT',
    );
  });

  // TEST 9
  it('does not restore applications when switching back to the original registration mode', async () => {
    const {
      club,
      application,
    } = await createAwaitingCashApplication();

    const settings =
      await prisma.clubMembershipSettings.findUniqueOrThrow({
        where: {
          clubId: club.id,
        },
      });

    await clubsService.updateMembershipMode(
      club.id,
      {
        registrationMode: 'WINDOWED',

        configVersion:
          settings.configVersion,
      },
    );

    const updatedSettings =
      await prisma.clubMembershipSettings.findUniqueOrThrow({
        where: {
          clubId: club.id,
        },
      });

    await clubsService.updateMembershipMode(
      club.id,
      {
        registrationMode: 'ALWAYS_OPEN',

        configVersion:
          updatedSettings.configVersion,
      },
    );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe('CANCELED');

    expect(stored.endReason).toBe(
      'POLICY_SWITCH',
    );
  });

  // TEST 10
  it('does not activate membership from an online callback after archive and reactivation', async () => {
    const {
      club,
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    await clubsService.archive(club.id);

    await clubsService.activate(club.id);

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',
      ),
    );

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedApplication.status).toBe(
      'CANCELED',
    );

    expect(storedApplication.endReason).toBe(
      'CLUB_ARCHIVED',
    );

    expect(storedPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });
});
describe('Sprint 6.F - Automatic reconciliation and delayed callbacks', () => {
  function createLifecycleService() {
    return new MembershipLifecycleService(
      prisma,

      new ConfigService({
        ENABLE_MEMBERSHIP_RECONCILIATION: 'false',
      }),
    );
  }

  async function expirePendingApplication(
    applicationId: string,
  ) {
    const deadline = new Date(
      Date.now() - MINUTE_MS,
    );

    await prisma.membershipApplication.update({
      where: {
        id: applicationId,
      },

      data: {
        submittedAt: new Date(
          deadline.getTime() - 14 * DAY_MS,
        ),

        originalDeadlineAt: deadline,

        paymentDeadlineAt: deadline,
      },
    });
  }

  // TEST 1
  it('reconciles an overdue application before returning the student action', async () => {
    const {
      club,
      account,
      application,
      payment,
    } = await createAwaitingCashApplication();

    await expirePendingApplication(
      application.id,
    );

    const quote =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(quote.action).toBe('APPLY');

    expect(quote.canApply).toBe(true);

    expect(quote.hasPendingApplication).toBe(false);

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedApplication.status).toBe(
      'EXPIRED',
    );

    expect(storedPayment.status).toBe(
      'EXPIRED',
    );
  });

  // TEST 2
  it('reconciles expired cash payments before returning the administrator list', async () => {
    const {
      club,
      application,
      payment,
    } = await createAwaitingCashApplication();

    const administrator =
      await createClubAdministrator(club.id);

    await expirePendingApplication(
      application.id,
    );

    const result =
      await paymentsService.getPendingCashPayments(
        administrator.account.id,
        club.id,
      );

    expect(result.total).toBe(0);

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'EXPIRED',
    );
  });

  // TEST 3
  it('reconciles overdue applications through the bounded batch processor', async () => {
    const { application } =
      await createAwaitingCashApplication();

    /*
     * Give this fixture an old deadline so it
     * appears near the beginning of the batch.
     */
    const deadline = new Date(
      '2000-01-15T00:00:00.000Z',
    );

    await prisma.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        submittedAt: new Date(
          '2000-01-01T00:00:00.000Z',
        ),

        originalDeadlineAt: deadline,

        paymentDeadlineAt: deadline,
      },
    });

    const lifecycleService =
      createLifecycleService();

    const result =
      await lifecycleService.reconcileDueApplications(
        100,
      );

    expect(result.changed).toBeGreaterThanOrEqual(1);

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe('EXPIRED');
  });

  // TEST 4
  it('does not expire a valid application during scheduled reconciliation', async () => {
    const { application } =
      await createAwaitingCashApplication();

    const lifecycleService =
      createLifecycleService();

    await lifecycleService.reconcileDueApplications(
      100,
    );

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe(
      'PENDING_PAYMENT',
    );
  });

  // TEST 5
  it('accepts a verified in-time success after the scheduler has expired the application', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    const lifecycleService =
      createLifecycleService();

    await lifecycleService.reconcileApplication(
      application.id,
    );

    const before =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(before.status).toBe('EXPIRED');

    const occurredAt = new Date(
      timing.graceEndsAt.getTime() -
        MINUTE_MS,
    );

    const event =
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',

        {
          occurredAt,
        },
      );

    await providerEventsService.processSignedEvent(
      event,
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    const storedApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(storedPayment.status).toBe(
      'CONFIRMED',
    );

    expect(storedApplication.status).toBe(
      'PAID',
    );

    expect(
      storedApplication.endReason,
    ).toBeNull();

    const membership =
      await prisma.membership.findUniqueOrThrow({
        where: {
          sourceApplicationId:
            application.id,
        },
      });

    expect(membership.activatedAt).toEqual(
      occurredAt,
    );
  });

  // TEST 6
  it('requires refund reconciliation for a genuinely late success after persisted expiration', async () => {
    const {
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    const lifecycleService =
      createLifecycleService();

    await lifecycleService.reconcileApplication(
      application.id,
    );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',

        {
          occurredAt: timing.now,
        },
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 7
  it('does not activate an expired application when a replacement application exists', async () => {
    const {
      club,
      account,
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    const lifecycleService =
      createLifecycleService();

    await lifecycleService.reconcileApplication(
      application.id,
    );

    const replacement =
      await applicationsService.createOrdinaryApplication(
        account.id,
        club.id,
      );

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',

        {
          occurredAt: new Date(
            timing.graceEndsAt.getTime() -
              MINUTE_MS,
          ),
        },
      ),
    );

    const oldPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    const replacementApplication =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: replacement.application.id,
        },
      });

    expect(oldPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(replacementApplication.status).toBe(
      'PENDING_PAYMENT',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 8
  it('prevents delayed confirmation after expiration followed by archive and reactivation', async () => {
    const {
      club,
      application,
      attempt,
      payment,
    } = await createProcessingOnlinePayment();

    const timing =
      await simulateOnlinePaymentDeadline(
        application.id,
        attempt.id,
        40,
      );

    const lifecycleService =
      createLifecycleService();

    await lifecycleService.reconcileApplication(
      application.id,
    );

    await clubsService.archive(club.id);

    await clubsService.activate(club.id);

    await providerEventsService.processSignedEvent(
      await createOnlineProviderEvent(
        attempt.id,
        'SUCCEEDED',

        {
          occurredAt: new Date(
            timing.graceEndsAt.getTime() -
              MINUTE_MS,
          ),
        },
      ),
    );

    const storedPayment =
      await prisma.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    expect(storedPayment.status).toBe(
      'REFUND_REQUIRED',
    );

    expect(
      await prisma.membership.count({
        where: {
          sourceApplicationId:
            application.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 9
  it('serializes concurrent reconciliation of the same expired application', async () => {
    const { application } =
      await createAwaitingCashApplication();

    await expirePendingApplication(
      application.id,
    );

    const lifecycleService =
      createLifecycleService();

    const results = await Promise.all([
      lifecycleService.reconcileApplication(
        application.id,
      ),

      lifecycleService.reconcileApplication(
        application.id,
      ),
    ]);

    expect(
      results.filter(
        result => result?.changed,
      ),
    ).toHaveLength(1);

    const stored =
      await prisma.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    expect(stored.status).toBe('EXPIRED');
  });

  // TEST 10
  it('offers renewal pricing after a confirmed membership has expired', async () => {
    const club = await createClub();

    const { student, account } =
      await createStudent();

    await prisma.membership.create({
      data: {
        clubId: club.id,

        studentId: student.id,

        activatedAt: new Date(
          '2023-01-01T00:00:00.000Z',
        ),

        expiresAt: new Date(
          '2024-01-01T00:00:00.000Z',
        ),
      },
    });

    const quote =
      await clubsService.getMembershipQuoteForAccount(
        account.id,
        club.id,
        true,
      );

    expect(quote.action).toBe('RENEW');

    expect(quote.canApply).toBe(true);

    expect(quote.amount).toBe('20.00');

    expect(quote.feeType).toBe('RENEWAL');

    expect(quote.alreadyActiveMember).toBe(false);
  });
});
describe('Sprint 6.G - Board membership coverage', () => {
  const referenceNow = new Date(
    '2026-11-27T10:00:00.000Z',
  );

  const requiredPeriod = {
    startAt: new Date(
      '2026-12-01T00:00:00.000Z',
    ),

    endAt: new Date(
      '2027-06-01T00:00:00.000Z',
    ),
  };

  async function evaluateCoverage(
    clubId: string,
    studentId: string,
  ) {
    return prisma.$transaction(
      async tx =>
        evaluateBoardMembershipCoverage(
          tx,

          clubId,

          studentId,

          requiredPeriod,
        ),
    );
  }

  // TEST 1
  it('requires nomination when the candidate has no membership', async () => {
    const club = await createClub();

    const { student } =
      await createStudent();

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.decision).toBe(
      'NOMINATION_REQUIRED',
    );

    expect(result.reason).toBe(
      'NO_MEMBERSHIP',
    );

    expect(result.fullyCovered).toBe(false);

    expect(
      result.hasMembershipHistory,
    ).toBe(false);
  });

  // TEST 2
  it('permits direct appointment when the entire term is covered', async () => {
    const club = await createClub();

    const { student } =
      await createStudent();

    await prisma.membership.create({
      data: {
        clubId: club.id,

        studentId: student.id,

        activatedAt: new Date(
          '2026-10-01T00:00:00.000Z',
        ),

        expiresAt: new Date(
          '2027-10-01T00:00:00.000Z',
        ),
      },
    });

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.decision).toBe(
      'DIRECT_APPOINTMENT',
    );

    expect(result.fullyCovered).toBe(true);

    expect(result.reason).toBeNull();

    expect(result.missingIntervals).toEqual([]);
  });

  // TEST 3
  it('requires nomination when membership expires during the board term', async () => {
    const club = await createClub();

    const { student } =
      await createStudent();

    const expiresAt = new Date(
      '2027-02-01T00:00:00.000Z',
    );

    await prisma.membership.create({
      data: {
        clubId: club.id,

        studentId: student.id,

        activatedAt: new Date(
          '2026-02-01T00:00:00.000Z',
        ),

        expiresAt,
      },
    });

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.decision).toBe(
      'NOMINATION_REQUIRED',
    );

    expect(result.reason).toBe(
      'INSUFFICIENT_COVERAGE',
    );

    expect(result.missingIntervals).toEqual([
      {
        startAt: expiresAt,

        endAt: requiredPeriod.endAt,
      },
    ]);
  });

  // TEST 4
  it('recognizes expired membership history without treating it as coverage', async () => {
    const club = await createClub();

    const { student } =
      await createStudent();

    await prisma.membership.create({
      data: {
        clubId: club.id,

        studentId: student.id,

        activatedAt: new Date(
          '2025-01-01T00:00:00.000Z',
        ),

        expiresAt: new Date(
          '2026-01-01T00:00:00.000Z',
        ),
      },
    });

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.fullyCovered).toBe(false);

    expect(
      result.hasMembershipHistory,
    ).toBe(true);

    expect(result.reason).toBe(
      'NO_MEMBERSHIP',
    );
  });

  // TEST 5
  it('accepts continuous adjacent membership intervals', async () => {
    const club = await createClub();

    const { student } =
      await createStudent();

    const boundary = new Date(
      '2027-02-01T00:00:00.000Z',
    );

    await prisma.membership.createMany({
      data: [
        {
          clubId: club.id,

          studentId: student.id,

          activatedAt: new Date(
            '2026-02-01T00:00:00.000Z',
          ),

          expiresAt: boundary,
        },

        {
          clubId: club.id,

          studentId: student.id,

          activatedAt: boundary,

          expiresAt: new Date(
            '2028-02-01T00:00:00.000Z',
          ),
        },
      ],
    });

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.fullyCovered).toBe(true);

    expect(result.membershipIds).toHaveLength(2);

    expect(result.decision).toBe(
      'DIRECT_APPOINTMENT',
    );
  });

  // TEST 6
  it('detects gaps between membership intervals', async () => {
    const club = await createClub();

    const { student } =
      await createStudent();

    const gapStart = new Date(
      '2027-02-01T00:00:00.000Z',
    );

    const gapEnd = new Date(
      '2027-02-02T00:00:00.000Z',
    );

    await prisma.membership.createMany({
      data: [
        {
          clubId: club.id,

          studentId: student.id,

          activatedAt: new Date(
            '2026-02-01T00:00:00.000Z',
          ),

          expiresAt: gapStart,
        },

        {
          clubId: club.id,

          studentId: student.id,

          activatedAt: gapEnd,

          expiresAt: new Date(
            '2028-02-02T00:00:00.000Z',
          ),
        },
      ],
    });

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.fullyCovered).toBe(false);

    expect(result.missingIntervals).toEqual([
      {
        startAt: gapStart,

        endAt: gapEnd,
      },
    ]);
  });

  // TEST 7
  it('does not use membership belonging to another club', async () => {
    const club = await createClub();

    const otherClub =
      await createClub();

    const { student } =
      await createStudent();

    await prisma.membership.create({
      data: {
        clubId: otherClub.id,

        studentId: student.id,

        activatedAt: new Date(
          '2026-10-01T00:00:00.000Z',
        ),

        expiresAt: new Date(
          '2027-10-01T00:00:00.000Z',
        ),
      },
    });

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.fullyCovered).toBe(false);

    expect(
      result.hasMembershipHistory,
    ).toBe(false);
  });

  // TEST 8
  it('does not treat an awaiting-cash application as paid coverage', async () => {
    const {
      club,
      student,
    } = await createAwaitingCashApplication();

    const result =
      await evaluateCoverage(
        club.id,
        student.id,
      );

    expect(result.fullyCovered).toBe(false);

    expect(result.reason).toBe(
      'NO_MEMBERSHIP',
    );
  });

  // TEST 9
  it('uses the exact current instant for appointments starting today', async () => {
    const term =
      validateNewBoardTerm(
        '2026-11-27',

        '2026-11-28',

        referenceNow,
      );

    const period =
      await prisma.$transaction(
        async tx =>
          resolveBoardCoveragePeriod(
            tx,
            term,
            referenceNow,
          ),
      );

    expect(period.startAt).toEqual(
      referenceNow,
    );

    expect(period.endAt).toEqual(
      new Date(
        '2026-11-28T22:00:00.000Z',
      ),
    );
  });

  // TEST 10
  it('converts future board dates to Palestine local midnight boundaries', async () => {
    const term =
      validateNewBoardTerm(
        '2026-12-01',

        '2026-12-02',

        referenceNow,
      );

    const period =
      await prisma.$transaction(
        async tx =>
          resolveBoardCoveragePeriod(
            tx,
            term,
            referenceNow,
          ),
      );

    expect(term.startDate).toEqual(
      parseBoardDate('2026-12-01'),
    );

    expect(period.startAt).toEqual(
      new Date(
        '2026-11-30T22:00:00.000Z',
      ),
    );

    expect(period.endAt).toEqual(
      new Date(
        '2026-12-02T22:00:00.000Z',
      ),
    );
  });
});
describe('Sprint 6.G - Direct appointments and provisional nominations', () => {
  async function createBoardFixture(
    registrationMode:
      | 'ALWAYS_OPEN'
      | 'WINDOWED' = 'ALWAYS_OPEN',
  ) {
    const club =
      await createClub(
        registrationMode,
      );

    const { student, account } =
      await createStudent();

    const deanship =
      await prisma.account.create({
        data: {
          email:
            `board-deanship-${uniqueSuffix()}@example.com`,

          passwordHash:
            'integration-test-only',

          role:
            'DEANSHIP',

          status:
            'ACTIVE',
        },
      });

    const boardService =
      new BoardAppointmentsService(
        prisma,
        new ClubEligibilityService(prisma),
      );

    const today =
      getLocalBoardDate(
        new Date(),
      );

    const dto = {
      studentId:
        student.id,

      position:
        'President',

      startDate:
        today.toISOString().slice(0, 10),

      endDate:
        addBoardCalendarDays(
          today,
          90,
        ).toISOString().slice(0, 10),
    };

    return {
      club,
      student,
      account,
      deanship,
      boardService,
      dto,
    };
  }

  // TEST 1
  it('creates a direct appointment when membership covers the entire board term', async () => {
    const fixture =
      await createBoardFixture();

    await prisma.membership.create({
      data: {
        clubId:
          fixture.club.id,

        studentId:
          fixture.student.id,

        activatedAt:
          new Date(
            Date.now() - DAY_MS,
          ),

        expiresAt:
          new Date(
            Date.now() + 300 * DAY_MS,
          ),
      },
    });

    const result =
      await fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      );

    expect(result.outcome).toBe(
      'DIRECT_APPOINTMENT',
    );

    expect(result.appointment).not.toBeNull();

    expect(result.nomination).toBeNull();

    expect(result.application).toBeNull();

    expect(
      await prisma.boardAppointment.count({
        where: {
          clubId:
            fixture.club.id,

          studentId:
            fixture.student.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.boardNomination.count({
        where: {
          clubId:
            fixture.club.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 2
  it('creates a provisional nomination for a candidate without membership', async () => {
    const fixture =
      await createBoardFixture();

    const result =
      await fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      );

    expect(result.outcome).toBe(
      'NOMINATION_CREATED',
    );

    expect(result.appointment).toBeNull();

    expect(result.nomination?.status).toBe(
      'PENDING_PAYMENT',
    );

    expect(result.nomination?.reason).toBe(
      'NO_MEMBERSHIP',
    );

    expect(result.application?.kind).toBe(
      'BOARD_ONBOARDING',
    );

    expect(result.application?.feeType).toBe(
      'FIRST_TIME',
    );

    expect(result.application?.quotedAmount).toBe(
      '30.00',
    );

    expect(
      result.application?.boardNominationId,
    ).toBe(
      result.nomination?.id,
    );
  });

  // TEST 3
  it('sets a nomination payment deadline exactly 72 hours after nomination', async () => {
    const fixture =
      await createBoardFixture();

    const result =
      await fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      );

    const nomination =
      result.nomination!;

    const application =
      result.application!;

    expect(
      nomination.deadlineAt.getTime() -
      nomination.nominatedAt.getTime(),
    ).toBe(
      72 * 60 * MINUTE_MS,
    );

    expect(
      application.paymentDeadlineAt,
    ).toEqual(
      nomination.deadlineAt,
    );

    expect(
      application.originalDeadlineAt,
    ).toEqual(
      nomination.deadlineAt,
    );
  });

  // TEST 4
  it('does not create membership or official leadership for an unpaid nominee', async () => {
    const fixture =
      await createBoardFixture();

    await fixture.boardService.create(
      fixture.club.id,
      fixture.dto,
      fixture.deanship.id,
    );

    expect(
      await prisma.membership.count({
        where: {
          clubId:
            fixture.club.id,

          studentId:
            fixture.student.id,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.boardAppointment.count({
        where: {
          clubId:
            fixture.club.id,

          studentId:
            fixture.student.id,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.clubAdminAssignment.count({
        where: {
          clubId:
            fixture.club.id,

          accountId:
            fixture.account.id,
        },
      }),
    ).toBe(0);

    const leadership =
      await fixture.boardService.current(
        fixture.club.id,
      );

    expect(leadership).toEqual([]);
  });

  // TEST 5
  it('permits board nomination while ordinary registration is closed', async () => {
    const fixture =
      await createBoardFixture(
        'WINDOWED',
      );

    const result =
      await fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      );

    expect(result.outcome).toBe(
      'NOMINATION_CREATED',
    );

    expect(
      result.application?.registrationWindowId,
    ).toBeNull();

    expect(
      result.application?.quotedAmount,
    ).toBe('30.00');

    const fee =
      await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
        where: {
          id:
            result.application!.feeVersionId,
        },
      });

    expect(fee.purpose).toBe(
      'BOARD_ONBOARDING',
    );
  });

  // TEST 6
  it('uses renewal pricing for a candidate with expired membership history', async () => {
    const fixture =
      await createBoardFixture();

    await prisma.membership.create({
      data: {
        clubId:
          fixture.club.id,

        studentId:
          fixture.student.id,

        activatedAt:
          new Date(
            Date.now() - 400 * DAY_MS,
          ),

        expiresAt:
          new Date(
            Date.now() - 35 * DAY_MS,
          ),
      },
    });

    const result =
      await fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      );

    expect(result.outcome).toBe(
      'NOMINATION_CREATED',
    );

    expect(result.application?.feeType).toBe(
      'RENEWAL',
    );

    expect(result.application?.quotedAmount).toBe(
      '20.00',
    );

    expect(
      result.outcome === 'NOMINATION_CREATED' &&
      result.membershipPlan.activationMode,
    ).toBe('IMMEDIATE');
  });

  // TEST 7
  it('plans prepaid renewal when existing membership expires during the board term', async () => {
    const fixture =
      await createBoardFixture();

    const expiry =
      new Date(
        Date.now() + 30 * DAY_MS,
      );

    await prisma.membership.create({
      data: {
        clubId:
          fixture.club.id,

        studentId:
          fixture.student.id,

        activatedAt:
          new Date(
            Date.now() - 335 * DAY_MS,
          ),

        expiresAt:
          expiry,
      },
    });

    const result =
      await fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      );

    expect(result.outcome).toBe(
      'NOMINATION_CREATED',
    );

    if (result.outcome !== 'NOMINATION_CREATED') {
      throw new Error(
        'Expected nomination outcome.',
      );
    }

    expect(result.nomination.reason).toBe(
      'INSUFFICIENT_COVERAGE',
    );

    expect(
      result.membershipPlan.activationMode,
    ).toBe('PREPAID_RENEWAL');

    expect(
      result.membershipPlan.projectedActivatedAt,
    ).toEqual(expiry);

    expect(
      result.application.feeType,
    ).toBe('RENEWAL');
  });

  // TEST 8
  it('rejects appointment creation by an ordinary student', async () => {
    const fixture =
      await createBoardFixture();

    await expect(
      fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.account.id,
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  // TEST 9
  it('prevents duplicate provisional nominations', async () => {
    const fixture =
      await createBoardFixture();

    await fixture.boardService.create(
      fixture.club.id,
      fixture.dto,
      fixture.deanship.id,
    );

    await expect(
      fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(
      await prisma.boardNomination.count({
        where: {
          clubId:
            fixture.club.id,

          studentId:
            fixture.student.id,
        },
      }),
    ).toBe(1);
  });

  // TEST 10
  it('does not create a competing nomination when the candidate already has an ordinary application', async () => {
    const fixture =
      await createBoardFixture();

    await applicationsService.createOrdinaryApplication(
      fixture.account.id,
      fixture.club.id,
    );

    await expect(
      fixture.boardService.create(
        fixture.club.id,
        fixture.dto,
        fixture.deanship.id,
      ),
    ).rejects.toMatchObject({
      status: 409,

      response: {
        code:
          'BOARD_CANDIDATE_HAS_LIVE_APPLICATION',
      },
    });

    expect(
      await prisma.boardNomination.count({
        where: {
          clubId:
            fixture.club.id,
        },
      }),
    ).toBe(0);
  });

  // TEST 11
  it('prevents nomination fee snapshots from affecting ordinary membership prices', async () => {
  const fixture =
    await createBoardFixture();

  const nomination =
    await fixture.boardService.create(
      fixture.club.id,
      fixture.dto,
      fixture.deanship.id,
    );

  /*
   * Create a separate exceptional fee version
   * instead of modifying an immutable version.
   */
  const exceptionalVersion =
    await prisma.clubMembershipFeeVersion.create({
      data: {
        clubId: fixture.club.id,

        purpose: 'BOARD_ONBOARDING',

        firstTimeFee: '99.00',

        renewalFee: '89.00',

        currency: 'ILS',

        effectiveAt: new Date(),

        createdById: fixture.deanship.id,
      },
    });

  /*
   * Verify ordinary registration availability
   * ignores exceptional membership fees.
   */
  const availability =
    await clubsService.getMembershipAvailability(
      fixture.club.id,
    );

  expect(
    availability.effectiveFees?.firstTimeFee,
  ).toBe('30.00');

  expect(
    availability.effectiveFees?.renewalFee,
  ).toBe('20.00');

  expect(
    availability.effectiveFees?.feeVersionId,
  ).not.toBe(exceptionalVersion.id);

  const anotherStudent =
    await createStudent();

  /*
   * Verify the student-facing membership quote.
   */
  const quote =
    await clubsService.getMembershipQuoteForAccount(
      anotherStudent.account.id,
      fixture.club.id,
      true,
    );

  expect(quote.amount).toBe('30.00');

  /*
   * Verify actual application creation uses
   * the ordinary fee version.
   */
  const ordinary =
    await applicationsService.createOrdinaryApplication(
      anotherStudent.account.id,
      fixture.club.id,
    );

  expect(
    ordinary.application.quotedAmount,
  ).toBe('30.00');

  expect(
    ordinary.application.feeVersionId,
  ).not.toBe(
    nomination.application!.feeVersionId,
  );

  expect(
    ordinary.application.feeVersionId,
  ).not.toBe(exceptionalVersion.id);

  const selectedVersion =
    await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
      where: {
        id: ordinary.application.feeVersionId,
      },
    });

  expect(selectedVersion.purpose).toBe(
    'STANDARD',
  );

  /*
   * Deanship's ordinary fee history must also
   * exclude exceptional versions.
   */
  const clubDetails =
    await clubsService.findOneForDeanship(
      fixture.club.id,
    );

  expect(
    clubDetails.membershipFeeVersions.every(
      version => version.purpose === 'STANDARD',
    ),
  ).toBe(true);
});

  // TEST 12
  it('serializes simultaneous nomination requests for the same candidate', async () => {
    const fixture =
      await createBoardFixture();

    const results =
      await Promise.allSettled([
        fixture.boardService.create(
          fixture.club.id,
          fixture.dto,
          fixture.deanship.id,
        ),

        fixture.boardService.create(
          fixture.club.id,
          fixture.dto,
          fixture.deanship.id,
        ),
      ]);

    expect(
      results.filter(
        result =>
          result.status === 'fulfilled',
      ),
    ).toHaveLength(1);

    expect(
      results.filter(
        result =>
          result.status === 'rejected',
      ),
    ).toHaveLength(1);

    expect(
      await prisma.boardNomination.count({
        where: {
          clubId:
            fixture.club.id,
        },
      }),
    ).toBe(1);
  });
});
});