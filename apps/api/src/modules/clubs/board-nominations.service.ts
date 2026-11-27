import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../../shared/prisma/prisma.service';

import type {
  MembershipTransaction,
} from '../../shared/membership/membership-lock';

import {
  lockMembershipClub,
  lockMembershipSettings,
  lockStudentClubMembership,
  getMembershipTransactionTime,
} from '../../shared/membership/membership-lock';

import {
  reconcileApplicationById,
} from '../../shared/membership/membership-lifecycle';

import {
  terminateBoardNomination,
  reconcileBoardNominationApplication,
} from '../../shared/membership/board-nomination-lifecycle';

@Injectable()
export class BoardNominationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async assertDeanship(
    accountId: string,

    db: MembershipTransaction = this.prisma,
  ) {
    const account =
      await db.account.findUnique({
        where: {
          id: accountId,
        },

        select: {
          role: true,

          status: true,
        },
      });

    if (
      !account ||
      account.role !== 'DEANSHIP' ||
      account.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'An active Deanship account is required.',
      );
    }
  }

  private readonly nominationInclude = {
    club: {
      select: {
        id: true,

        name: true,

        status: true,

        logoUrl: true,
      },
    },

    student: {
      select: {
        id: true,

        universityId: true,

        fullName: true,

        email: true,
      },
    },

    application: {
      include: {
        payments: {
          orderBy: {
            createdAt: 'desc',
          },

          take: 1,

          include: {
            attempts: {
              orderBy: {
                initiatedAt: 'desc',
              },

              take: 1,

              select: {
                id: true,

                status: true,

                initiatedAt: true,

                nominalDeadlineAt: true,
              },
            },
          },
        },
      },
    },

    boardAppointment: {
      select: {
        id: true,

        position: true,

        startDate: true,

        endDate: true,

        endedAt: true,
      },
    },
  } as const;

  /**
   * Reconcile live applications before returning
   * nomination management data.
   */
  private async reconcileNominations(
    where: {
      clubId?: string;

      studentId?: string;
    },
  ) {
    const applications =
      await this.prisma.membershipApplication.findMany({
        where: {
          ...where,

          kind: 'BOARD_ONBOARDING',

          status: {
            in: [
              'PENDING_PAYMENT',
              'PAYMENT_PROCESSING',
            ],
          },
        },

        select: {
          id: true,
        },
      });

    for (const application of applications) {
      await reconcileApplicationById(
        this.prisma,
        application.id,
      );
    }
  }

  /**
   * Deanship: view all nominations for a club,
   * including historical nominations.
   */
  async findAllForClub(
    accountId: string,
    clubId: string,
  ) {
    await this.assertDeanship(accountId);

    const club =
      await this.prisma.club.findUnique({
        where: {
          id: clubId,
        },

        select: {
          id: true,
        },
      });

    if (!club) {
      throw new NotFoundException(
        'Club not found.',
      );
    }

    await this.reconcileNominations({
      clubId,
    });

    await this.assertDeanship(accountId);

    const nominations =
      await this.prisma.boardNomination.findMany({
        where: {
          clubId,
        },

        include:
          this.nominationInclude,

        orderBy: [
          {
            nominatedAt: 'desc',
          },

          {
            id: 'desc',
          },
        ],
      });

    return {
      clubId,

      total: nominations.length,

      nominations,
    };
  }

  /**
   * Student: view only their own nominations.
   *
   * Includes active and historical nominations.
   */
  async findMyNominations(
    accountId: string,
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
      throw new ForbiddenException(
        'An active student account is required.',
      );
    }

    const studentId =
      account.universityStudentId;

    await this.reconcileNominations({
      studentId,
    });

    const currentAccount =
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
      !currentAccount ||
      currentAccount.status !== 'ACTIVE' ||
      currentAccount.role !== 'STUDENT' ||
      currentAccount.universityStudentId !== studentId
    ) {
      throw new ForbiddenException(
        'The student account is no longer active.',
      );
    }

    const nominations =
      await this.prisma.boardNomination.findMany({
        where: {
          studentId,
        },

        include:
          this.nominationInclude,

        orderBy: [
          {
            nominatedAt: 'desc',
          },

          {
            id: 'desc',
          },
        ],
      });

    /*
     * Return only student-facing financial fields.
     * Internal provider identifiers and financial
     * reconciliation details are not exposed.
     */
    return {
      total: nominations.length,

      nominations: nominations.map(
        nomination => {
          const application =
            nomination.application;

          const payment =
            application?.payments[0] ?? null;

          const attempt =
            payment?.attempts[0] ?? null;

          return {
            id: nomination.id,

            club: nomination.club,

            position: nomination.position,

            proposedStartDate:
              nomination.proposedStartDate,

            proposedEndDate:
              nomination.proposedEndDate,

            nominatedAt:
              nomination.nominatedAt,

            deadlineAt:
              nomination.deadlineAt,

            status: nomination.status,

            reason: nomination.reason,

            qualifiedAt:
              nomination.qualifiedAt,

            expiredAt:
              nomination.expiredAt,

            withdrawnAt:
              nomination.withdrawnAt,

            boardAppointment:
              nomination.boardAppointment,

            application: application
              ? {
                  id: application.id,

                  kind: application.kind,

                  status: application.status,

                  feeType: application.feeType,

                  quotedAmount:
                    application.quotedAmount.toFixed(2),

                  currency:
                    application.currency,

                  paymentDeadlineAt:
                    application.paymentDeadlineAt,

                  endReason:
                    application.endReason,

                  payment: payment
                    ? {
                        id: payment.id,

                        method: payment.method,

                        status: payment.status,

                        amount:
                          payment.amount.toFixed(2),

                        currency:
                          payment.currency,

                        confirmedAt:
                          payment.confirmedAt,

                        attempt,
                      }
                    : null,
                }
              : null,
          };
        },
      ),
    };
  }

  /**
   * Deanship: withdraw an unpaid nomination.
   */
  async withdraw(
    accountId: string,
    clubId: string,
    nominationId: string,
  ) {
    await this.assertDeanship(accountId);

    const initial =
      await this.prisma.boardNomination.findFirst({
        where: {
          id: nominationId,

          clubId,
        },
      });

    if (!initial) {
      throw new NotFoundException(
        'Board nomination not found.',
      );
    }

    /*
     * Persist normal expiration before attempting
     * a manual withdrawal.
     */
    const initialApplication =
      await this.prisma.membershipApplication.findUnique({
        where: {
          boardNominationId: nominationId,
        },

        select: {
          id: true,
        },
      });

    if (!initialApplication) {
      throw new ConflictException(
        'The nomination has no membership application.',
      );
    }

    await reconcileApplicationById(
      this.prisma,
      initialApplication.id,
    );

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
        initial.studentId,
      );

      await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Account"
        WHERE "id" = ${accountId}::uuid
        FOR UPDATE
      `;

      await this.assertDeanship(
        accountId,
        tx,
      );

      const nomination =
        await tx.boardNomination.findUniqueOrThrow({
          where: {
            id: nominationId,
          },
        });

      /*
       * Withdrawal is idempotent.
       */
      if (nomination.status === 'WITHDRAWN') {
        return {
          nomination,

          alreadyWithdrawn: true,
        };
      }

      if (nomination.status === 'QUALIFIED') {
        throw new ConflictException({
          code: 'NOMINATION_ALREADY_QUALIFIED',

          message:
            'A qualified nomination cannot be withdrawn. Manage its official board appointment instead.',
        });
      }

      if (nomination.status === 'EXPIRED') {
        throw new ConflictException({
          code: 'NOMINATION_ALREADY_EXPIRED',

          message:
            'The nomination has already expired.',
        });
      }

      const application =
        await tx.membershipApplication.findUniqueOrThrow({
          where: {
            boardNominationId:
              nomination.id,
          },
        });

      const now =
        await getMembershipTransactionTime(tx);

      /*
       * Recheck time and club status under locks.
       *
       * A deadline could have been crossed while
       * waiting for the transaction.
       */
      const reconciliation =
        await reconcileBoardNominationApplication(
          tx,
          application,
          now,
        );

      if (!reconciliation.changed) {
        await terminateBoardNomination(
          tx,
          application,
          now,
          'WITHDRAWN',
        );
      }

      const updated =
        await tx.boardNomination.findUniqueOrThrow({
          where: {
            id: nominationId,
          },
        });

      return {
        nomination: updated,

        alreadyWithdrawn: false,
      };
    });
  }
}