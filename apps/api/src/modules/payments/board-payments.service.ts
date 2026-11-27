import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
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
  lockStudentClubMembership,
  getMembershipTransactionTime,
} from '../../shared/membership/membership-lock';

import type {
  MembershipTransaction,
} from '../../shared/membership/membership-lock';

import {
  BoardPaymentConfirmationService,
} from './board-payment-confirmation.service';

@Injectable()
export class BoardPaymentsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly eligibilityService:
      ClubEligibilityService,

    private readonly confirmationService:
      BoardPaymentConfirmationService,
  ) {}

  private async assertActiveDeanship(
    accountId: string,

    db: MembershipTransaction = this.prisma,
  ) {
    const account =
      await db.account.findUnique({
        where: {
          id: accountId,
        },

        select: {
          id: true,

          role: true,

          status: true,
        },
      });

    if (
      !account ||

      account.role !== 'DEANSHIP' ||

      account.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException({
        code: 'DEANSHIP_REQUIRED',

        message:
          'Only active Deanship accounts can manage nomination payments.',
      });
    }

    return account;
  }

  /**
   * Confirm a board nomination cash payment.
   */
  async confirmCashPayment(
    deanshipAccountId: string,
    clubId: string,
    paymentId: string,
  ) {
    await this.assertActiveDeanship(
      deanshipAccountId,
    );

    const initialPayment =
      await this.prisma.payment.findFirst({
        where: {
          id: paymentId,

          method: 'IN_PERSON',

          provider: 'MANUAL',

          membershipApplication: {
            is: {
              clubId,

              kind: 'BOARD_ONBOARDING',
            },
          },
        },

        include: {
          membershipApplication: true,
        },
      });

    if (!initialPayment?.membershipApplication) {
      throw new NotFoundException(
        'Board nomination cash payment not found.',
      );
    }

    const initialApplication =
      initialPayment.membershipApplication;

    return this.prisma.$transaction(async tx => {
      await lockMembershipClub(
        tx,
        clubId,
      );

      await lockMembershipSettings(
        tx,
        clubId,
      );

      await lockStudentClubMembership(
        tx,
        clubId,
        initialApplication.studentId,
      );

      /*
       * Lock and recheck Deanship authorization.
       */
      await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Account"
        WHERE "id" = ${deanshipAccountId}::uuid
        FOR UPDATE
      `;

      await this.assertActiveDeanship(
        deanshipAccountId,
        tx,
      );

      const payment =
        await tx.payment.findFirst({
          where: {
            id: paymentId,

            method: 'IN_PERSON',

            provider: 'MANUAL',

            membershipApplication: {
              is: {
                clubId,

                kind: 'BOARD_ONBOARDING',
              },
            },
          },

          include: {
            membershipApplication: true,
          },
        });

      if (!payment?.membershipApplication) {
        throw new NotFoundException(
          'Board nomination cash payment not found.',
        );
      }

      const application =
        payment.membershipApplication;

      /*
       * Confirmed payments remain idempotently
       * readable even after nomination qualification.
       */
      const alreadyConfirmed =
        payment.status === 'CONFIRMED' &&
        application.status === 'PAID';

      if (!alreadyConfirmed) {
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
            'The nominee no longer has an active student account.',
          );
        }

        /*
         * Protect against concurrent suspension
         * of the candidate account.
         */
        await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "Account"
          WHERE "id" = ${studentAccount.id}::uuid
          FOR UPDATE
        `;

        const currentStudentAccount =
          await tx.account.findUniqueOrThrow({
            where: {
              id: studentAccount.id,
            },
          });

        if (
          currentStudentAccount.status !== 'ACTIVE' ||

          currentStudentAccount.role !== 'STUDENT' ||

          currentStudentAccount.universityStudentId !==
            application.studentId
        ) {
          throw new ConflictException(
            'The nominee account is no longer valid.',
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
              'The nominee is no longer eligible for this club.',
          });
        }
      }

      const confirmedAt =
        await getMembershipTransactionTime(tx);

      const result =
        await this.confirmationService.confirmBoardCashPayment(
          tx,
          {
            application,

            payment,

            confirmedAt,

            confirmedByAccountId:
              deanshipAccountId,
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

  /**
   * List nomination cash payments awaiting
   * Deanship confirmation for a particular club.
   */
  async getPendingCashPayments(
    deanshipAccountId: string,
    clubId: string,
  ) {
    await this.assertActiveDeanship(
      deanshipAccountId,
    );

    const club =
      await this.prisma.club.findUnique({
        where: {
          id: clubId,
        },

        select: {
          id: true,

          status: true,
        },
      });

    if (!club) {
      throw new NotFoundException(
        'Club not found.',
      );
    }

    if (club.status !== 'ACTIVE') {
      return {
        clubId,

        total: 0,

        payments: [],
      };
    }

    const clock =
      await this.prisma.$queryRaw<
        { now: Date }[]
      >`
        SELECT clock_timestamp() AS now
      `;

    const now = clock[0].now;

    const payments =
      await this.prisma.payment.findMany({
        where: {
          method: 'IN_PERSON',

          provider: 'MANUAL',

          status: 'AWAITING_CASH',

          membershipApplication: {
            is: {
              clubId,

              kind: 'BOARD_ONBOARDING',

              status: 'PENDING_PAYMENT',

              paymentDeadlineAt: {
                gt: now,
              },

              boardNomination: {
                is: {
                  status: 'PENDING_PAYMENT',

                  deadlineAt: {
                    gt: now,
                  },
                },
              },
            },
          },
        },

        include: {
          membershipApplication: {
            include: {
              boardNomination: true,

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

      payments: payments.map(payment => {
        const application =
          payment.membershipApplication!;

        const nomination =
          application.boardNomination!;

        return {
          paymentId: payment.id,

          applicationId: application.id,

          nominationId: nomination.id,

          student: application.student,

          position: nomination.position,

          proposedStartDate:
            nomination.proposedStartDate,

          proposedEndDate:
            nomination.proposedEndDate,

          feeType: application.feeType,

          amount: payment.amount.toFixed(2),

          currency: payment.currency,

          method: payment.method,

          status: payment.status,

          nominatedAt: nomination.nominatedAt,

          paymentDeadlineAt:
            application.paymentDeadlineAt,

          paymentSelectedAt: payment.createdAt,
        };
      }),
    };
  }
}