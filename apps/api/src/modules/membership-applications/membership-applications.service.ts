import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';

import { PrismaService } from '../../shared/prisma/prisma.service';

import { ClubsService } from '../clubs/clubs.service';
import { ClubEligibilityService } from '../clubs/club-eligibility.service';

import {
  lockMembershipClub,
  lockMembershipSettings,
  lockMembershipRegistrationWindow,
  lockStudentClubMembership,
  getMembershipTransactionTime,
} from '../../shared/membership/membership-lock';

import {
  calculateAlwaysOpenDeadline,
} from '../../shared/membership/membership-time';
import {
  reconcileOrdinaryApplication,
} from '../../shared/membership/membership-lifecycle';

@Injectable()
export class MembershipApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubsService: ClubsService,
    private readonly eligibilityService: ClubEligibilityService,
  ) {}

  async createOrdinaryApplication(
    accountId: string,
    clubId: string,
  ) {
    const initialAccount = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        role: true,
        status: true,
        universityStudentId: true,
      },
    });

    if (
      !initialAccount ||
      initialAccount.role !== 'STUDENT' ||
      initialAccount.status !== 'ACTIVE' ||
      !initialAccount.universityStudentId
    ) {
      throw new ForbiddenException({
        code: 'STUDENT_ACCOUNT_REQUIRED',
        message: 'An active student account is required.',
      });
    }

    /*
     * Reuse the existing Sprint 5 availability resolver.
     * It can activate the immutable fee snapshot of an
     * open registration window when necessary.
     *
     * Do this before opening our transaction because
     * the existing resolver manages its own transactions.
     */
    await this.clubsService.getMembershipAvailability(clubId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockMembershipClub(tx, clubId);

        const club = await tx.club.findUnique({
          where: { id: clubId },
          select: {
            id: true,
            status: true,
          },
        });

        if (!club) {
          throw new NotFoundException('Club not found.');
        }

        if (club.status !== 'ACTIVE') {
          throw new ConflictException({
            code: 'REGISTRATION_CLOSED',
            message: 'This club is archived.',
          });
        }

        const settingsExist =
          await tx.clubMembershipSettings.findUnique({
            where: { clubId },
            select: { id: true },
          });

        if (!settingsExist) {
          throw new ConflictException({
            code: 'FEE_VERSION_UNAVAILABLE',
            message: 'Membership configuration is missing.',
          });
        }

        await lockMembershipSettings(tx, clubId);

        const settings =
          await tx.clubMembershipSettings.findUniqueOrThrow({
            where: { clubId },
          });

        const account = await tx.account.findUnique({
          where: { id: accountId },
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
            message: 'An active student account is required.',
          });
        }

        const studentId = account.universityStudentId;

        let windowId: string | null = null;

        /*
         * Resolve and lock the applicable registration window.
         */
        if (settings.registrationMode === 'WINDOWED') {
          const windowCheckTime =
            await getMembershipTransactionTime(tx);

          const window =
            await tx.clubRegistrationWindow.findFirst({
              where: {
                clubId,
                canceledAt: null,
                closedAt: null,
                opensAt: { lte: windowCheckTime },
                closesAt: { gt: windowCheckTime },
              },
              orderBy: {
                opensAt: 'asc',
              },
            });

          if (!window) {
            throw new ConflictException({
              code: 'REGISTRATION_CLOSED',
              message: 'Membership registration is closed.',
            });
          }

          await lockMembershipRegistrationWindow(
            tx,
            clubId,
            window.id,
          );

          windowId = window.id;
        }

        await lockStudentClubMembership(
          tx,
          clubId,
          studentId,
        );

        /*
         * Read authoritative time after obtaining locks.
         */
        const now = await getMembershipTransactionTime(tx);

        /*
         * Reuse the existing academic eligibility rules.
         */
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
              'You are not eligible to join this club.',
            details: {
              reason: eligibility.reason,
            },
          });
        }

        const activeMembership =
          await tx.membership.findFirst({
            where: {
              clubId,
              studentId,
              activatedAt: { lte: now },
              expiresAt: { gt: now },
            },
            select: {
              id: true,
              expiresAt: true,
            },
          });

        if (activeMembership) {
          throw new ConflictException({
            code: 'ALREADY_ACTIVE_MEMBER',
            message:
              'You already have an active membership.',
            details: {
              membershipId: activeMembership.id,
              expiresAt: activeMembership.expiresAt,
            },
          });
        }

        let pendingApplication =
  await tx.membershipApplication.findFirst({
    where: {
      clubId,

      studentId,

      status: {
        in: [
          'PENDING_PAYMENT',
          'PAYMENT_PROCESSING',
        ],
      },
    },
  });

if (
  pendingApplication &&
  pendingApplication.kind === 'ORDINARY'
) {
  const reconciliation =
    await reconcileOrdinaryApplication(
      tx,
      pendingApplication,
      now,
    );

  if (
    reconciliation.status === 'EXPIRED' ||
    reconciliation.status === 'CANCELED'
  ) {
    pendingApplication = null;
  }
}

if (pendingApplication) {
  throw new ConflictException({
    code: 'APPLICATION_ALREADY_PENDING',

    message:
      'You already have a pending membership application.',

    details: {
      currentApplicationId:
        pendingApplication.id,

      status:
        pendingApplication.status,

      paymentDeadlineAt:
        pendingApplication.paymentDeadlineAt,

      quotedAmount:
        pendingApplication.quotedAmount.toFixed(2),

      currency:
        pendingApplication.currency,
    },
  });
}

        /*
         * Renewal pricing depends on confirmed membership
         * history, not previous unpaid applications.
         */
        const previousMembership =
          await tx.membership.findFirst({
            where: {
              clubId,
              studentId,
            },
            select: {
              id: true,
            },
          });

        const feeType = previousMembership
          ? 'RENEWAL'
          : 'FIRST_TIME';

        let feeVersionId: string;
        let paymentDeadlineAt: Date;

        /*
         * Resolve authoritative pricing and deadlines
         * within the locked transaction.
         */
        if (settings.registrationMode === 'ALWAYS_OPEN') {
          const version =
            await tx.clubMembershipFeeVersion.findFirst({
              where: {
                clubId,
                purpose: 'STANDARD',
                effectiveAt: { lte: now },
              },
              orderBy: [
                { effectiveAt: 'desc' },
                { createdAt: 'desc' },
                { id: 'desc' },
              ],
              select: {
                id: true,
              },
            });

          if (!version) {
            throw new ConflictException({
              code: 'FEE_VERSION_UNAVAILABLE',
              message:
                'An effective membership fee is unavailable.',
            });
          }

          feeVersionId = version.id;

          paymentDeadlineAt =
            calculateAlwaysOpenDeadline(now);
        } else {
          if (!windowId) {
            throw new ConflictException({
              code: 'REGISTRATION_CLOSED',
              message: 'Membership registration is closed.',
            });
          }

          const window =
            await tx.clubRegistrationWindow.findUnique({
              where: { id: windowId },
            });

          if (
            !window ||
            window.clubId !== clubId ||
            window.closedAt ||
            window.canceledAt ||
            window.opensAt > now ||
            window.closesAt <= now
          ) {
            throw new ConflictException({
              code: 'REGISTRATION_CLOSED',
              message: 'Membership registration is closed.',
            });
          }

          if (!window.effectiveFeeVersionId) {
            throw new ConflictException({
              code: 'FEE_VERSION_UNAVAILABLE',
              message:
                'The registration window fee is unavailable. Please retry.',
            });
          }

          feeVersionId = window.effectiveFeeVersionId;
          paymentDeadlineAt = window.closesAt;
        }

        const feeVersion =
          await tx.clubMembershipFeeVersion.findFirst({
            where: {
              id: feeVersionId,
              clubId,
              purpose: 'STANDARD',
            },
          });

        if (!feeVersion) {
          throw new ConflictException({
            code: 'FEE_VERSION_UNAVAILABLE',
            message:
              'The authoritative membership fee could not be found.',
          });
        }

        const quotedAmount =
          feeType === 'RENEWAL'
            ? feeVersion.renewalFee
            : feeVersion.firstTimeFee;

        if (
          !quotedAmount.gt(0) ||
          feeVersion.currency !== 'ILS'
        ) {
          throw new ConflictException({
            code: 'FEE_VERSION_UNAVAILABLE',
            message:
              'The membership fee configuration is invalid.',
          });
        }

        /*
         * Create only an application.
         * No payment or membership is created here.
         */
        const application =
          await tx.membershipApplication.create({
            data: {
              clubId,
              studentId,
              kind: 'ORDINARY',
              status: 'PENDING_PAYMENT',

              feeType,
              feeVersionId,
              quotedAmount,
              currency: feeVersion.currency,

              registrationWindowId: windowId,

              registrationModeAtSubmission:
                settings.registrationMode,

              submittedAt: now,
              paymentDeadlineAt,
              originalDeadlineAt: paymentDeadlineAt,
            },
          });

        return {
          application: {
            ...application,
            quotedAmount:
              application.quotedAmount.toFixed(2),
          },
        };
      });
    } catch (error) {
      /*
       * The PostgreSQL partial unique index is the final
       * protection against duplicate live applications.
       */
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'APPLICATION_ALREADY_PENDING',
          message:
            'A pending membership application already exists.',
        });
      }

      throw error;
    }
  }
}