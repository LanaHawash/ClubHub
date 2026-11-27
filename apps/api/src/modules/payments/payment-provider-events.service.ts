import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { createHash } from 'node:crypto';

import {
  Prisma,
} from '../../generated/prisma/client';

import {
  PrismaService,
} from '../../shared/prisma/prisma.service';

import {
  ClubEligibilityService,
} from '../clubs/club-eligibility.service';

import {
  PaymentConfirmationService,
} from './payment-confirmation.service';

import {
  lockMembershipClub,
  lockMembershipSettings,
  lockMembershipRegistrationWindow,
  lockStudentClubMembership,
  getMembershipTransactionTime,
  lockProviderEventIdentity,
} from '../../shared/membership/membership-lock';

import {
  assertOrdinaryApplicationPayable,
} from '../../shared/membership/membership-payable';

import {
  calculateMembershipExpiration,
  calculateEarlyClosureGraceDeadline,
} from '../../shared/membership/membership-time';

import {
  ONLINE_PAYMENT_PROVIDER,
} from './providers/payment-provider.interface';

import type {
  OnlinePaymentProvider,
  SignedProviderPaymentEvent,
} from './providers/payment-provider.interface';

import {
  BoardPaymentConfirmationService,
} from './board-payment-confirmation.service';

import {
  assertBoardNominationPayable,
} from '../../shared/membership/board-nomination-payable';

@Injectable()
export class PaymentProviderEventsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly eligibilityService:
      ClubEligibilityService,

    private readonly confirmationService:
      PaymentConfirmationService,

    @Inject(ONLINE_PAYMENT_PROVIDER)
    private readonly provider:
      OnlinePaymentProvider,

    private readonly boardConfirmationService:
      BoardPaymentConfirmationService =
        new BoardPaymentConfirmationService(),
  ) {}

  async processSignedEvent(
    signedEvent: SignedProviderPaymentEvent,
  ) {
    /*
     * Verify authenticity before accessing payment
     * records or performing financial operations.
     */
    const receiptClock =
    await this.prisma.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
    `;

    const receivedAt = receiptClock[0].now;
    const event =
      this.provider.verifyEvent(signedEvent);

    const payloadDigest = createHash('sha256')
      .update(signedEvent.payload, 'utf8')
      .digest('hex');

    const recordedEvent =
    await this.prisma.paymentProviderEvent.findUnique({
        where: {
        provider_providerEventId: {
            provider: event.provider,

            providerEventId:
            event.providerEventId,
        },
        },

        select: {
        payloadDigest: true,
        },
    });

    if (
    recordedEvent &&
    recordedEvent.payloadDigest !== payloadDigest
    ) {
    throw new ConflictException({
        code: 'PROVIDER_EVENT_IDENTITY_CONFLICT',

        message:
        'This provider event ID has already been used with a different payload.',
    });
    }
    const initialAttempt =
      await this.prisma.paymentAttempt.findUnique({
        where: {
          provider_providerAttemptRef: {
            provider: event.provider,

            providerAttemptRef:
              event.providerAttemptRef,
          },
        },

        include: {
          payment: {
            include: {
              membershipApplication: true,
            },
          },
        },
      });

    if (
      !initialAttempt ||
      !initialAttempt.payment.membershipApplication
    ) {
      throw new NotFoundException(
        'Payment attempt not found.',
      );
    }

    const initialApplication =
      initialAttempt.payment.membershipApplication;

    return this.prisma.$transaction(async (tx) => {
      const clubId =
        initialApplication.clubId;

      await lockProviderEventIdentity(
        tx,
        event.provider,
        event.providerEventId,
        );
      await lockMembershipClub(tx, clubId);

      await lockMembershipSettings(tx, clubId);

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

      const processedAt =
  await getMembershipTransactionTime(tx);
      const attempt =
        await tx.paymentAttempt.findUniqueOrThrow({
          where: {
            id: initialAttempt.id,
          },

          include: {
            payment: {
              include: {
                membershipApplication: true,
              },
            },
          },
        });

      const payment = attempt.payment;

      const application =
        payment.membershipApplication;

      if (
        !application ||
        payment.method !== 'ONLINE' ||
        payment.provider !== event.provider ||
        attempt.provider !== event.provider
      ) {
        throw new ConflictException(
          'Invalid online membership payment.',
        );
      }
const isBoardNomination =
  application.kind === 'BOARD_ONBOARDING';
      /*
       * The provider event ID must only be processed
       * once. A reused ID with a different payload
       * is not an ordinary duplicate.
       */
      const existingEvent =
        await tx.paymentProviderEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider: event.provider,

              providerEventId:
                event.providerEventId,
            },
          },
        });

      if (existingEvent) {
        if (
          existingEvent.payloadDigest !== payloadDigest ||
          existingEvent.paymentAttemptId !== attempt.id
        ) {
          throw new ConflictException(
            'Provider event identity conflict.',
          );
        }

        return {
          duplicate: true,

          eventStatus:
            existingEvent.status,

          applicationStatus:
            application.status,

          paymentStatus:
            payment.status,

          attemptStatus:
            attempt.status,
        };
      }

      /*
       * Validate financial data.
       */
      if (
        !payment.amount.equals(event.amount) ||
        !application.quotedAmount.equals(event.amount) ||
        event.currency !== payment.currency ||
        event.currency !== application.currency
      ) {
        throw new ConflictException({
          code: 'PAYMENT_AMOUNT_MISMATCH',

          message:
            'Provider payment does not match the application quote.',
        });
      }

      /*
       * A verified event cannot occur before the
       * attempt started or after it was received.
       */
      if (
        event.occurredAt < attempt.initiatedAt ||
        event.occurredAt > receivedAt
      ) {
        throw new BadRequestException(
          'Invalid provider event chronology.',
        );
      }

      const ledgerEvent =
        await tx.paymentProviderEvent.create({
          data: {
            provider: event.provider,

            providerEventId:
              event.providerEventId,

            paymentAttemptId:
              attempt.id,

            outcome:
              event.outcome,

            payloadDigest,

            providerOccurredAt:
              event.occurredAt,

            receivedAt,
          },
        });

      const finishEvent = async (
        status:
          | 'APPLIED'
          | 'IGNORED'
          | 'RECONCILIATION_REQUIRED',

        note: string,
      ) => {
        await tx.paymentProviderEvent.update({
          where: {
            id: ledgerEvent.id,
          },

          data: {
            status,

            processedAt,

            processingNote: note,
          },
        });
      };

      /*
       * A successfully resolved attempt must never
       * regress into FAILED or UNKNOWN.
       */
      if (
        attempt.status === 'SUCCEEDED' ||
        attempt.status === 'REFUNDED' ||
        attempt.status ===
          'LATE_SUCCESS_REFUND_REQUIRED'
      ) {
        await finishEvent(
          'IGNORED',
          'Attempt already resolved.',
        );

        return {
          duplicate: false,
          eventStatus: 'IGNORED',
          applicationStatus: application.status,
          paymentStatus: payment.status,
          attemptStatus: attempt.status,
        };
      }

      /*
       * Check whether a provider event is older than
       * the most recently accepted event for this attempt.
       */
      if (
        attempt.providerEventAt &&
        event.occurredAt < attempt.providerEventAt &&
        event.outcome !== 'SUCCEEDED'
      ) {
        await finishEvent(
          'IGNORED',
          'Older provider event.',
        );

        return {
          duplicate: false,
          eventStatus: 'IGNORED',
          applicationStatus: application.status,
          paymentStatus: payment.status,
          attemptStatus: attempt.status,
        };
      }

      const unresolved =
        attempt.status === 'INITIATED' ||
        attempt.status === 'PROCESSING' ||
        attempt.status === 'UNKNOWN';

      const applicationProcessing =
        application.status === 'PAYMENT_PROCESSING' &&
        payment.status === 'PROCESSING';

       const eligibleExpiredReconciliation =
  !isBoardNomination &&
  attempt.status === 'EXPIRED' &&

  application.status === 'EXPIRED' &&

  payment.status === 'EXPIRED' &&

  (
    application.endReason === 'TIMEOUT' ||
    application.endReason === 'WINDOW_CLOSED' ||
    application.endReason === 'EARLY_WINDOW_CLOSE'
  );
      /*
       * Do not let an old attempt modify the current
       * application after a later attempt has started.
       */
      const newerAttempt =
        await tx.paymentAttempt.findFirst({
          where: {
            payment: {
              membershipApplicationId:
                application.id,
            },

            id: {
              not: attempt.id,
            },

            initiatedAt: {
              gte: attempt.initiatedAt,
            },
          },

          select: {
            id: true,
          },
        });

      /*
       * UNKNOWN is not a definitive failure.
       * The student cannot retry while this attempt
       * remains unresolved.
       */
      if (event.outcome === 'UNKNOWN') {
        if (
          !unresolved ||
          !applicationProcessing ||
          newerAttempt
        ) {
          await finishEvent(
            'IGNORED',
            'Unknown outcome for inactive attempt.',
          );

          return {
            duplicate: false,
            eventStatus: 'IGNORED',
          };
        }

        await tx.paymentAttempt.update({
          where: {
            id: attempt.id,
          },

          data: {
            status: 'UNKNOWN',

            providerEventAt:
              event.occurredAt,

            receivedAt,

            providerPayloadDigest:
              payloadDigest,
          },
        });

        await finishEvent(
          'APPLIED',
          'Payment outcome remains unknown.',
        );

        return {
          duplicate: false,
          eventStatus: 'APPLIED',

          applicationStatus:
            'PAYMENT_PROCESSING',

          paymentStatus: 'PROCESSING',

          attemptStatus: 'UNKNOWN',
        };
      }

      /*
       * Definitive failure allows retry only while
       * the original application is still payable.
       */
      if (event.outcome === 'FAILED') {
        if (!unresolved) {
          await finishEvent(
            'IGNORED',
            'Attempt already inactive.',
          );

          return {
            duplicate: false,
            eventStatus: 'IGNORED',
          };
        }

        await tx.paymentAttempt.update({
          where: {
            id: attempt.id,
          },

          data: {
            status: 'FAILED',

            failureCode:
              event.failureCode ??
              'PROVIDER_PAYMENT_FAILED',

            providerEventAt:
              event.occurredAt,

            receivedAt,

            resolvedAt: processedAt,

            providerPayloadDigest:
              payloadDigest,
          },
        });

        if (
          !applicationProcessing ||
          newerAttempt
        ) {
          await finishEvent(
            'APPLIED',
            'Inactive attempt failure recorded.',
          );

          return {
            duplicate: false,
            eventStatus: 'APPLIED',
            attemptStatus: 'FAILED',
          };
        }

        let canRetry = false;

try {
  if (isBoardNomination) {
    await assertBoardNominationPayable(
      tx,
      application,
      processedAt,
      {
        allowProcessing: true,
      },
    );
  } else {
    await assertOrdinaryApplicationPayable(
      tx,
      {
        ...application,
        status: 'PENDING_PAYMENT',
      },
      processedAt,
    );
  }

  canRetry = true;
} catch (error) {
  if (
    !(error instanceof ConflictException) &&
    !(error instanceof BadRequestException)
  ) {
    throw error;
  }
}

        await tx.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: 'FAILED',
          },
        });

        await tx.membershipApplication.update({
  where: {
    id: application.id,
  },

  data: {
    status: canRetry
      ? 'PENDING_PAYMENT'
      : 'EXPIRED',

    processingGraceEndsAt:
      null,

    endReason: canRetry
      ? null
      : 'PAYMENT_FAILED',
  },
});
if (isBoardNomination) {
  await tx.boardNomination.updateMany({
    where: {
      id: application.boardNominationId!,

      status: 'PAYMENT_PROCESSING',
    },

    data: {
      status: canRetry
        ? 'PENDING_PAYMENT'
        : 'EXPIRED',

      expiredAt: canRetry
        ? null
        : processedAt,
    },
  });
}

        await finishEvent(
          'APPLIED',
          canRetry
            ? 'Definitive failure; retry permitted.'
            : 'Definitive failure; retry unavailable.',
        );

        return {
          duplicate: false,

          eventStatus: 'APPLIED',

          applicationStatus: canRetry
            ? 'PENDING_PAYMENT'
            : 'EXPIRED',

          paymentStatus: 'FAILED',

          attemptStatus: 'FAILED',

          canRetry,
        };
      }

      /*
       * From this point the provider has reported
       * a verified successful payment.
       */

      const markRefundRequired = async (
        reason: string,
      ) => {
        await tx.paymentAttempt.update({
          where: {
            id: attempt.id,
          },

          data: {
            status:
              'LATE_SUCCESS_REFUND_REQUIRED',

            providerEventAt:
              event.occurredAt,

            receivedAt,

            resolvedAt: processedAt,

            providerPayloadDigest:
              payloadDigest,

            failureMessageSafe: reason,
          },
        });

        /*
         * Never overwrite a valid confirmed payment
         * or a logical payment used by a newer attempt.
         */
        if (
          payment.status !== 'CONFIRMED' &&
          !newerAttempt
        ) {
          await tx.payment.update({
            where: {
              id: payment.id,
            },

            data: {
              status: 'REFUND_REQUIRED',
            },
          });
        }

        if (
          applicationProcessing &&
          !newerAttempt
        ) {
          await tx.membershipApplication.update({
            where: {
              id: application.id,
            },

            data: {
              status: 'EXPIRED',

              endReason:
                'PAYMENT_FAILED',

              processingGraceEndsAt:
                null,
            },
          });

          if (isBoardNomination) {
  await tx.boardNomination.updateMany({
    where: {
      id: application.boardNominationId!,

      status: 'PAYMENT_PROCESSING',
    },

    data: {
      status: 'EXPIRED',

      expiredAt: processedAt,
    },
  });
}
        }

        await finishEvent(
          'RECONCILIATION_REQUIRED',
          reason,
        );

        return {
          duplicate: false,

          eventStatus:
            'RECONCILIATION_REQUIRED',

          attemptStatus:
            'LATE_SUCCESS_REFUND_REQUIRED',

          refundRequired: true,

          reason,
        };
      };

     const normalSuccess =
  unresolved &&
  applicationProcessing;

if (
  (!normalSuccess && !eligibleExpiredReconciliation) ||
  newerAttempt
) {
  return markRefundRequired(
    'Successful payment for an inactive attempt.',
  );
}
if (eligibleExpiredReconciliation) {
  const replacementApplication =
    await tx.membershipApplication.findFirst({
      where: {
        clubId: application.clubId,

        studentId: application.studentId,

        id: {
          not: application.id,
        },

        status: {
          in: [
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
            'PAID',
          ],
        },

        submittedAt: {
          gte: application.submittedAt,
        },
      },

      select: {
        id: true,
      },
    });

  if (replacementApplication) {
    return markRefundRequired(
      'A replacement membership application already exists.',
    );
  }
}
      const club =
        await tx.club.findUniqueOrThrow({
          where: {
            id: clubId,
          },

          include: {
            membershipSettings: true,
          },
        });

      if (club.status !== 'ACTIVE') {
        return markRefundRequired(
          'Club is no longer active.',
        );
      }

      if (
  !isBoardNomination &&
  (
    !club.membershipSettings ||
    club.membershipSettings.registrationMode !==
      application.registrationModeAtSubmission
  )
) {
  return markRefundRequired(
    'Registration policy has changed.',
  );
}

      let effectiveGraceCutoff =
  isBoardNomination
    ? application.paymentDeadlineAt
    : attempt.processingGraceEndsAt;

      if (application.processingGraceEndsAt) {
        effectiveGraceCutoff = new Date(
          Math.min(
            effectiveGraceCutoff.getTime(),
            application.processingGraceEndsAt.getTime(),
          ),
        );
      }

      /*
       * Early window closure can shorten the
       * original grace cutoff.
       */
      if (
  !isBoardNomination &&
  application.registrationModeAtSubmission ===
    'WINDOWED'
) {
        if (!application.registrationWindowId) {
          return markRefundRequired(
            'Original registration window missing.',
          );
        }

        const window =
          await tx.clubRegistrationWindow.findUnique({
            where: {
              id: application.registrationWindowId,
            },
          });

        if (
          !window ||
          window.clubId !== clubId ||
          window.canceledAt
        ) {
          return markRefundRequired(
            'Original registration window unavailable.',
          );
        }

        if (
          window.closedAt &&
          window.closedAt < window.closesAt
        ) {
          if (
            attempt.initiatedAt >= window.closedAt
          ) {
            return markRefundRequired(
              'Payment attempt started after early closure.',
            );
          }

          effectiveGraceCutoff =
            calculateEarlyClosureGraceDeadline(
              window.closedAt,
              effectiveGraceCutoff,
            );
        }
      }

      /*
       * The provider's verified occurrence time,
       * not callback arrival time, determines whether
       * this processing attempt finished in time.
       */
      if (
        event.occurredAt >= effectiveGraceCutoff
      ) {
        return markRefundRequired(
          'Provider success occurred after the processing cutoff.',
        );
      }

      /*
       * Verify that the student remains eligible.
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
        return markRefundRequired(
          'Applicant account is no longer active.',
        );
      }

      const eligibility =
        await this.eligibilityService.evaluateForAccount(
          studentAccount.id,
          clubId,
          tx,
        );

      if (!eligibility.eligible) {
        return markRefundRequired(
          'Applicant is no longer academically eligible.',
        );
      }

      /*
 * Board nomination success uses the exceptional
 * membership activation and qualification workflow.
 */
if (isBoardNomination) {
  /*
   * Perform all expected business validation before
   * attempting financial state changes.
   */
  try {
    await assertBoardNominationPayable(
      tx,
      application,
      processedAt,
      {
        allowProcessing: true,

        paymentOccurredAt:
          event.occurredAt,
      },
    );
  } catch (error) {
    if (
      error instanceof ConflictException ||
      error instanceof BadRequestException
    ) {
      return markRefundRequired(
        'Nomination no longer qualifies for membership and board appointment.',
      );
    }

    throw error;
  }

  /*
   * Finalize membership, payment, nomination
   * and official board appointment atomically.
   */
  const result =
    await this.boardConfirmationService.confirmBoardPayment(
      tx,
      {
        application,

        payment,

        confirmedAt:
          event.occurredAt,

        confirmedByAccountId:
          null,

        qualificationAt:
          processedAt,
      },
    );

  await tx.paymentAttempt.update({
    where: {
      id: attempt.id,
    },

    data: {
      status: 'SUCCEEDED',

      providerEventAt:
        event.occurredAt,

      receivedAt,

      resolvedAt:
        processedAt,

      providerPayloadDigest:
        payloadDigest,
    },
  });

  await finishEvent(
    'APPLIED',

    'Online nomination payment confirmed and board appointment qualified.',
  );

  return {
    duplicate: false,

    eventStatus:
      'APPLIED',

    applicationStatus:
      result.application.status,

    paymentStatus:
      result.payment.status,

    attemptStatus:
      'SUCCEEDED',

    membership:
      result.membership,

    nomination:
      result.nomination,

    appointment:
      result.appointment,
  };
}

      const expiresAt =
        calculateMembershipExpiration(
          event.occurredAt,
        );

      const overlappingMembership =
        await tx.membership.findFirst({
          where: {
            clubId,

            studentId:
              application.studentId,

            activatedAt: {
              lt: expiresAt,
            },

            expiresAt: {
              gt: event.occurredAt,
            },
          },

          select: {
            id: true,
          },
        });

      if (overlappingMembership) {
        return markRefundRequired(
          'Existing membership overlaps the proposed membership.',
        );
      }

      /*
       * Use the same atomic confirmation service
       * as ordinary cash payments.
       */
     const result =
  await this.confirmationService.confirmOrdinaryPayment(
    tx,
    {
      application,

      payment,

      confirmedAt:
        event.occurredAt,

      confirmedByAccountId:
        null,

      allowExpiredOnlineReconciliation:
        eligibleExpiredReconciliation,
    },
  );

      await tx.paymentAttempt.update({
        where: {
          id: attempt.id,
        },

        data: {
          status: 'SUCCEEDED',

          providerEventAt:
            event.occurredAt,

          receivedAt,

          resolvedAt: processedAt,

          providerPayloadDigest:
            payloadDigest,
        },
      });

      await finishEvent(
        'APPLIED',
        'Online payment confirmed successfully.',
      );

      return {
        duplicate: false,

        eventStatus: 'APPLIED',

        applicationStatus:
          result.application.status,

        paymentStatus:
          result.payment.status,

        attemptStatus: 'SUCCEEDED',

        membership: result.membership,
      };
    });
  }
}