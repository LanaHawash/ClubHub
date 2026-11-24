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

describe('Sprint 6.C - Membership applications integration', () => {
  let prisma: PrismaService;
  let clubsService: ClubsService;
  let applicationsService: MembershipApplicationsService;

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

    prisma = new PrismaService();

    await prisma.$connect();

    clubsService = new ClubsService(prisma);

    applicationsService =
      new MembershipApplicationsService(
        prisma,
        clubsService,
        new ClubEligibilityService(prisma),
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
});