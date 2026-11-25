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
describe('Sprint 6.C - Membership applications integration', () => {
  let prisma: PrismaService;
  let clubsService: ClubsService;
  let applicationsService: MembershipApplicationsService;
  let paymentsService: PaymentsService;

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
});