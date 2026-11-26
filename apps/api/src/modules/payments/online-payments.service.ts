import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

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
  calculateOnlineGraceDeadline,
} from '../../shared/membership/membership-time';

import {
  ONLINE_PAYMENT_PROVIDER,
} from './providers/payment-provider.interface';

import type {
  OnlinePaymentProvider,
} from './providers/payment-provider.interface';

@Injectable()
export class OnlinePaymentsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly eligibilityService:
      ClubEligibilityService,

    @Inject(ONLINE_PAYMENT_PROVIDER)
    private readonly provider:
      OnlinePaymentProvider,
  ) {}

  /**
   * Starts an online payment attempt for an ordinary
   * membership application owned by the student.
   */
  async initiateOnlinePayment(
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
      throw new ForbiddenException(
        'An active student account is required.',
      );
    }

    const studentId =
      account.universityStudentId;

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

      /*
       * Revalidate the authenticated account.
       */
      const currentAccount =
        await tx.account.findUnique({
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
            clubId,
            studentId,
          },
        });

      if (!application) {
        throw new NotFoundException(
          'Membership application not found.',
        );
      }

      if (application.kind !== 'ORDINARY') {
        throw new ConflictException(
          'An ordinary membership application is required.',
        );
      }

      /*
       * An existing unresolved attempt must block
       * creation of a second attempt.
       */
      const unresolvedAttempt =
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

          include: {
            payment: true,
          },
        });

      if (unresolvedAttempt) {
        return {
          applicationStatus:
            application.status,

          payment: {
            ...unresolvedAttempt.payment,

            amount:
              unresolvedAttempt.payment.amount.toFixed(2),
          },

          attempt: {
            id: unresolvedAttempt.id,

            status:
              unresolvedAttempt.status,

            initiatedAt:
              unresolvedAttempt.initiatedAt,

            nominalDeadlineAt:
              unresolvedAttempt.nominalDeadlineAt,

            processingGraceEndsAt:
              unresolvedAttempt.processingGraceEndsAt,
          },

          existingAttempt: true,
        };
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
       * Do not allow cash and online payment methods
       * to be simultaneously active.
       */
      const existingLivePayment =
        await tx.payment.findFirst({
          where: {
            membershipApplicationId:
              application.id,

            status: {
              in: [
                'AWAITING_CASH',
                'PROCESSING',
              ],
            },
          },
        });

      if (existingLivePayment) {
        throw new ConflictException({
          code: 'PAYMENT_METHOD_ALREADY_SELECTED',

          message:
            'Another payment is already active for this application.',
        });
      }

      /*
       * Reuse a definitively failed online payment
       * when the original application is still valid.
       *
       * Each retry will receive a new PaymentAttempt.
       */
      let payment =
        await tx.payment.findFirst({
          where: {
            membershipApplicationId:
              application.id,

            method: 'ONLINE',

            provider: this.provider.name,

            status: 'FAILED',
          },

          orderBy: {
            createdAt: 'desc',
          },
        });

      if (payment) {
        if (
          !payment.amount.equals(
            application.quotedAmount,
          ) ||
          payment.currency !== application.currency
        ) {
          throw new ConflictException(
            'Payment quote is inconsistent.',
          );
        }

        payment = await tx.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: 'PROCESSING',
          },
        });
      } else {
        payment = await tx.payment.create({
          data: {
            membershipApplicationId:
              application.id,

            method: 'ONLINE',

            provider:
              this.provider.name,

            status: 'PROCESSING',

            amount:
              application.quotedAmount,

            currency:
              application.currency,
          },
        });
      }

      const processingGraceEndsAt =
        calculateOnlineGraceDeadline(
          application.paymentDeadlineAt,
        );

      /*
       * Create a distinct attempt with a server-generated
       * idempotency key.
       */
      const attempt =
        await tx.paymentAttempt.create({
          data: {
            paymentId: payment.id,

            provider:
              this.provider.name,

            status: 'INITIATED',

            idempotencyKey:
              randomUUID(),

            initiatedAt: now,

            nominalDeadlineAt:
              application.paymentDeadlineAt,

            processingGraceEndsAt,
          },
        });

      /*
       * The current simulated provider performs only
       * local deterministic operations.
       *
       * A real external gateway must not make network
       * requests while these database locks are held.
       */
      const providerResult =
        await this.provider.initiatePayment({
          paymentId: payment.id,

          attemptId: attempt.id,

          idempotencyKey:
            attempt.idempotencyKey,

          amount:
            application.quotedAmount.toFixed(2),

          currency:
            application.currency,

          nominalDeadlineAt:
            application.paymentDeadlineAt,

          processingGraceEndsAt,
        });

      if (
        providerResult.provider !== this.provider.name ||
        providerResult.status !== 'PROCESSING'
      ) {
        throw new ConflictException(
          'Unexpected payment provider response.',
        );
      }

      if (
        payment.providerPaymentId &&
        payment.providerPaymentId !==
          providerResult.providerPaymentId
      ) {
        throw new ConflictException(
          'Payment provider reference mismatch.',
        );
      }

      const processingPayment =
        await tx.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            providerPaymentId:
              providerResult.providerPaymentId,
          },
        });

      const processingAttempt =
        await tx.paymentAttempt.update({
          where: {
            id: attempt.id,
          },

          data: {
            status: 'PROCESSING',

            providerAttemptRef:
              providerResult.providerAttemptRef,
          },
        });

      const processingApplication =
        await tx.membershipApplication.update({
          where: {
            id: application.id,
          },

          data: {
            status: 'PAYMENT_PROCESSING',

            processingGraceEndsAt,
          },
        });

      return {
        applicationStatus:
          processingApplication.status,

        payment: {
          ...processingPayment,

          amount:
            processingPayment.amount.toFixed(2),
        },

        attempt: {
          id: processingAttempt.id,

          status:
            processingAttempt.status,

          initiatedAt:
            processingAttempt.initiatedAt,

          nominalDeadlineAt:
            processingAttempt.nominalDeadlineAt,

          processingGraceEndsAt:
            processingAttempt.processingGraceEndsAt,
        },

        existingAttempt: false,
      };
    });
  }
}