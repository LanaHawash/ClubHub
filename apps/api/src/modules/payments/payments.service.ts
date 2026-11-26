import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../../shared/prisma/prisma.service';

import {
  ClubEligibilityService,
} from '../clubs/club-eligibility.service';

import {
  lockMembershipClub,
  lockMembershipSettings,
  lockMembershipRegistrationWindow,
  lockStudentClubMembership,
  getMembershipTransactionTime,
} from '../../shared/membership/membership-lock';

import {
  assertOrdinaryApplicationPayable,
} from '../../shared/membership/membership-payable';
import {
  ClubAdminAssignmentsService,
} from '../clubs/club-admin-assignments.service';

import {
  PaymentConfirmationService,
} from './payment-confirmation.service';
import {
  reconcileApplicationById,
} from '../../shared/membership/membership-lifecycle';

@Injectable()
export class PaymentsService {
  constructor(
  private readonly prisma: PrismaService,

  private readonly eligibilityService:
    ClubEligibilityService,

  private readonly adminAssignmentsService:
    ClubAdminAssignmentsService,

  private readonly confirmationService:
    PaymentConfirmationService,
) {}

  /**
   * Selects in-person payment for an ordinary
   * membership application.
   *
   * This operation never activates membership.
   */
  async selectCashPayment(
    accountId: string,
    applicationId: string,
  ) {
    const account =
      await this.prisma.account.findUnique({
        where: {
          id: accountId,
        },

        select: {
          role: true,
          status: true,
          universityStudentId: true,
        },
      });

    if (
      !account ||
      account.role !== 'STUDENT' ||
      account.status !== 'ACTIVE' ||
      !account.universityStudentId
    ) {
      throw new ForbiddenException({
        code: 'STUDENT_ACCOUNT_REQUIRED',
        message:
          'An active student account is required.',
      });
    }

    const studentId =
      account.universityStudentId;

    /*
     * Only retrieve an application belonging to
     * the authenticated student.
     */
    const initialApplication =
      await this.prisma.membershipApplication.findFirst({
        where: {
          id: applicationId,
          studentId,
        },
      });

    if (!initialApplication) {
      throw new NotFoundException(
        'Membership application not found.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const clubId =
        initialApplication.clubId;

      await lockMembershipClub(
        tx,
        clubId,
      );

      await lockMembershipSettings(
        tx,
        clubId,
      );

      if (
        initialApplication.registrationWindowId
      ) {
        await lockMembershipRegistrationWindow(
          tx,
          clubId,
          initialApplication.registrationWindowId,
        );
      }

      await lockStudentClubMembership(
        tx,
        clubId,
        studentId,
      );

      const currentAccount =
        await tx.account.findUnique({
          where: { id: accountId },

          select: {
            role: true,
            status: true,
            universityStudentId: true,
          },
        });

      if (
        !currentAccount ||
        currentAccount.role !== 'STUDENT' ||
        currentAccount.status !== 'ACTIVE' ||
        currentAccount.universityStudentId !== studentId
      ) {
        throw new ForbiddenException(
          'An active student account is required.',
        );
      }

      const application =
        await tx.membershipApplication.findFirst({
          where: {
            id: applicationId,
            studentId,
            clubId,
          },
        });

      if (!application) {
        throw new NotFoundException(
          'Membership application not found.',
        );
      }

      const eligibility =
        await this.eligibilityService.evaluateForAccount(
          accountId,
          clubId,
          tx,
        );

      if (!eligibility.eligible) {
        throw new ForbiddenException({
          code: 'INELIGIBLE',
          message:
            'The student is not eligible for this membership.',
        });
      }

      const now =
        await getMembershipTransactionTime(tx);

      await assertOrdinaryApplicationPayable(
        tx,
        application,
        now,
      );

      /*
       * Repeating the same cash selection must not
       * create additional payment records.
       */
      const existingCashPayment =
        await tx.payment.findFirst({
          where: {
            membershipApplicationId:
              application.id,

            method: 'IN_PERSON',
            status: 'AWAITING_CASH',
          },
        });

      if (existingCashPayment) {
        return {
          payment: {
            ...existingCashPayment,

            amount:
              existingCashPayment.amount.toFixed(2),
          },

          applicationStatus:
            application.status,
        };
      }

      /*
       * An unresolved online payment must prevent
       * another payment from being started.
       */
      const unresolvedOnlineAttempt =
        await tx.paymentAttempt.findFirst({
          where: {
            payment: {
              membershipApplicationId:
                application.id,
            },

            status: {
              in: [
                'INITIATED',
                'PROCESSING',
                'UNKNOWN',
              ],
            },
          },

          select: {
            id: true,
          },
        });

      if (unresolvedOnlineAttempt) {
        throw new ConflictException({
          code: 'PAYMENT_ALREADY_PROCESSING',
          message:
            'An online payment is still being processed.',
        });
      }

      const processingPayment =
        await tx.payment.findFirst({
          where: {
            membershipApplicationId:
              application.id,

            status: 'PROCESSING',
          },

          select: {
            id: true,
          },
        });

      if (processingPayment) {
        throw new ConflictException({
          code: 'PAYMENT_ALREADY_PROCESSING',
          message:
            'Another payment is already processing.',
        });
      }

      /*
       * Always use the application's frozen quote.
       * Never accept an amount from the client.
       */
      const payment =
        await tx.payment.create({
          data: {
            membershipApplicationId:
              application.id,

            method: 'IN_PERSON',
            provider: 'MANUAL',
            status: 'AWAITING_CASH',

            amount:
              application.quotedAmount,

            currency:
              application.currency,
          },
        });

      return {
        payment: {
          ...payment,

          amount:
            payment.amount.toFixed(2),
        },

        applicationStatus:
          application.status,
      };
    });
  }
  async confirmCashPayment(
  administratorAccountId: string,
  clubId: string,
  paymentId: string,
) {
  /*
   * Check administrative access before returning
   * information about the payment.
   */
  await this.adminAssignmentsService.assertCanManageClub(
    clubId,
    administratorAccountId,
  );

  const initialPayment =
    await this.prisma.payment.findFirst({
      where: {
        id: paymentId,

        method: 'IN_PERSON',

        membershipApplication: {
          is: {
            clubId,
            kind: 'ORDINARY',
          },
        },
      },

      include: {
        membershipApplication: true,
      },
    });

  if (
    !initialPayment ||
    !initialPayment.membershipApplication
  ) {
    throw new NotFoundException(
      'Cash membership payment not found.',
    );
  }

  const initialApplication =
    initialPayment.membershipApplication;

  return this.prisma.$transaction(async (tx) => {
    await lockMembershipClub(
      tx,
      clubId,
    );

    await lockMembershipSettings(
      tx,
      clubId,
    );

    if (
      initialApplication.registrationWindowId
    ) {
      await lockMembershipRegistrationWindow(
        tx,
        clubId,
        initialApplication.registrationWindowId,
      );
    }

    await lockStudentClubMembership(
      tx,
      clubId,
      initialApplication.studentId,
    );

    /*
     * Lock the administrator account and grant.
     *
     * A concurrent account suspension or grant revocation
     * must serialize with the confirmation.
     */
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Account"
      WHERE "id" = ${administratorAccountId}::uuid
      FOR UPDATE
    `;

    const assignment =
      await this.adminAssignmentsService.assertCanManageClub(
        clubId,
        administratorAccountId,
        tx,
      );

    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubAdminAssignment"
      WHERE "id" = ${assignment.id}::uuid
      FOR UPDATE
    `;

    const assignmentRecord =
      await tx.clubAdminAssignment.findUniqueOrThrow({
        where: {
          id: assignment.id,
        },
      });

    /*
     * Protect against concurrent board termination.
     */
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "BoardAppointment"
      WHERE "id" = ${assignmentRecord.boardAppointmentId}::uuid
      FOR UPDATE
    `;

    /*
     * Recheck authorization after acquiring locks.
     */
    await this.adminAssignmentsService.assertCanManageClub(
      clubId,
      administratorAccountId,
      tx,
    );

    const payment =
      await tx.payment.findFirst({
        where: {
          id: paymentId,
          method: 'IN_PERSON',

          membershipApplication: {
            is: {
              clubId,
              kind: 'ORDINARY',
            },
          },
        },

        include: {
          membershipApplication: true,
        },
      });

    if (
      !payment ||
      !payment.membershipApplication
    ) {
      throw new NotFoundException(
        'Cash membership payment not found.',
      );
    }

    const application =
      payment.membershipApplication;

      
      const administratorAccount =
  await tx.account.findUnique({
    where: {
      id: administratorAccountId,
    },

    select: {
      universityStudentId: true,
    },
  });

if (
  administratorAccount?.universityStudentId ===
  application.studentId
) {
  throw new ForbiddenException({
    code: 'SELF_CONFIRMATION_FORBIDDEN',

    message:
      'Administrators cannot confirm their own membership payments.',
  });
}
    const now =
      await getMembershipTransactionTime(tx);

    /*
     * Repeated confirmation returns the already-created
     * membership without modifying financial records.
     */
    if (
      payment.status === 'CONFIRMED' &&
      application.status === 'PAID'
    ) {
      const result =
        await this.confirmationService.confirmOrdinaryPayment(
          tx,
          {
            application,
            payment,
            confirmedAt: now,
            confirmedByAccountId:
              administratorAccountId,
          },
        );

      return {
        ...result,

        payment: {
          ...result.payment,
          amount:
            result.payment.amount.toFixed(2),
        },

        application: {
          ...result.application,
          quotedAmount:
            result.application.quotedAmount.toFixed(2),
        },
      };
    }

    /*
     * Require the correct payment state.
     */
    if (
      payment.provider !== 'MANUAL' ||
      payment.status !== 'AWAITING_CASH'
    ) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_CONFIRMABLE',
        message:
          'This cash payment is not awaiting confirmation.',
      });
    }

    /*
     * Validate that the applicant still has
     * an active student account.
     */
    const studentAccount =
      await tx.account.findUnique({
        where: {
          universityStudentId:
            application.studentId,
        },

        select: {
          id: true,
          role: true,
          status: true,
        },
      });

    if (
      !studentAccount ||
      studentAccount.role !== 'STUDENT' ||
      studentAccount.status !== 'ACTIVE'
    ) {
      throw new ConflictException(
        'The applicant no longer has an active student account.',
      );
    }

    const eligibility =
      await this.eligibilityService.evaluateForAccount(
        studentAccount.id,
        clubId,
        tx,
      );

    if (!eligibility.eligible) {
      throw new ConflictException({
        code: 'INELIGIBLE',
        message:
          'The applicant is no longer eligible for membership.',
      });
    }

    /*
     * Cash has no processing grace period.
     */
    const confirmedAt =
      await getMembershipTransactionTime(tx);

    await assertOrdinaryApplicationPayable(
      tx,
      application,
      confirmedAt,
    );

    /*
     * Atomically confirm payment, mark application PAID
     * and create the official membership.
     */
    const result =
      await this.confirmationService.confirmOrdinaryPayment(
        tx,
        {
          application,
          payment,
          confirmedAt,
          confirmedByAccountId:
            administratorAccountId,
        },
      );

    return {
      ...result,

      payment: {
        ...result.payment,
        amount:
          result.payment.amount.toFixed(2),
      },

      application: {
        ...result.application,
        quotedAmount:
          result.application.quotedAmount.toFixed(2),
      },
    };
  });
}
async getPendingCashPayments(
  administratorAccountId: string,
  clubId: string,
) {
  await this.adminAssignmentsService.assertCanManageClub(
    clubId,
    administratorAccountId,
  );
  const pendingApplications =
  await this.prisma.membershipApplication.findMany({
    where: {
      clubId,

      kind: 'ORDINARY',

      status: 'PENDING_PAYMENT',

      payments: {
        some: {
          method: 'IN_PERSON',

          status: 'AWAITING_CASH',
        },
      },
    },

    select: {
      id: true,
    },
  });

for (const application of pendingApplications) {
  await reconcileApplicationById(
    this.prisma,
    application.id,
  );
}

/*
 * Administrative access could have changed
 * during reconciliation.
 */
await this.adminAssignmentsService.assertCanManageClub(
  clubId,
  administratorAccountId,
);

  const now = new Date();

  const payments =
    await this.prisma.payment.findMany({
      where: {
        method: 'IN_PERSON',
        provider: 'MANUAL',
        status: 'AWAITING_CASH',

        membershipApplication: {
          is: {
            clubId,
            kind: 'ORDINARY',
            status: 'PENDING_PAYMENT',

            paymentDeadlineAt: {
              gt: now,
            },
          },
        },
      },

      include: {
        membershipApplication: {
          include: {
            student: {
              select: {
                id: true,
                universityId: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: 'asc',
      },
    });

  return {
    clubId,

    total: payments.length,

    payments: payments.map((payment) => {
      const application =
        payment.membershipApplication!;

      return {
        paymentId: payment.id,

        applicationId: application.id,

        student: application.student,

        feeType: application.feeType,

        amount: payment.amount.toFixed(2),

        currency: payment.currency,

        method: payment.method,

        status: payment.status,

        submittedAt:
          application.submittedAt,

        paymentDeadlineAt:
          application.paymentDeadlineAt,

        paymentSelectedAt:
          payment.createdAt,
      };
    }),
  };
}
}