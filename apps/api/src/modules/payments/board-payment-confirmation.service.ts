import {
  Injectable,
  ConflictException,
} from '@nestjs/common';

import type {
  MembershipApplication,
  Payment,
} from '../../generated/prisma/client';

import type {
  MembershipTransaction,
} from '../../shared/membership/membership-lock';

import {
  assertBoardNominationPayable,
} from '../../shared/membership/board-nomination-payable';

import {
  evaluateBoardMembershipCoverage,
} from '../../shared/membership/board-membership-coverage';

interface ConfirmBoardCashPaymentInput {
  application: MembershipApplication;

  payment: Payment;

  confirmedAt: Date;

  confirmedByAccountId: string;
}

@Injectable()
export class BoardPaymentConfirmationService {
  /**
   * Finalizes an authorized board nomination cash payment.
   *
   * The caller must:
   * - Open the transaction.
   * - Acquire membership locks.
   * - Verify active Deanship authorization.
   * - Verify the candidate's academic eligibility.
   */
  async confirmBoardCashPayment(
    tx: MembershipTransaction,
    input: ConfirmBoardCashPaymentInput,
  ) {
    const {
      application,
      payment,
      confirmedAt,
      confirmedByAccountId,
    } = input;

    if (
      application.kind !== 'BOARD_ONBOARDING' ||
      !application.boardNominationId
    ) {
      throw new ConflictException(
        'A board nomination application is required.',
      );
    }

    if (
      payment.membershipApplicationId !==
        application.id ||

      payment.eventRegistrationId !== null ||

      payment.method !== 'IN_PERSON' ||

      payment.provider !== 'MANUAL'
    ) {
      throw new ConflictException(
        'Invalid board nomination cash payment.',
      );
    }

    if (
      !payment.amount.equals(
        application.quotedAmount,
      ) ||

      payment.currency !== application.currency
    ) {
      throw new ConflictException({
        code: 'PAYMENT_AMOUNT_MISMATCH',

        message:
          'The payment does not match the nomination quote.',
      });
    }

    /*
     * Repeated confirmation must preserve the original
     * membership, appointment and confirming actor.
     */
    if (
      application.status === 'PAID' &&
      payment.status === 'CONFIRMED'
    ) {
      const nomination =
        await tx.boardNomination.findUniqueOrThrow({
          where: {
            id: application.boardNominationId,
          },
        });

      const membership =
        await tx.membership.findUnique({
          where: {
            sourceApplicationId: application.id,
          },
        });

      if (
        nomination.status !== 'QUALIFIED' ||

        !nomination.boardAppointmentId ||

        !membership ||

        membership.sourcePaymentId !== payment.id ||

        membership.clubId !== application.clubId ||

        membership.studentId !== application.studentId
      ) {
        throw new ConflictException(
          'Confirmed nomination records are inconsistent.',
        );
      }

      const appointment =
        await tx.boardAppointment.findUniqueOrThrow({
          where: {
            id: nomination.boardAppointmentId,
          },
        });

      return {
        payment,

        application,

        membership,

        appointment,

        nomination,

        alreadyConfirmed: true,
      };
    }

    if (payment.status !== 'AWAITING_CASH') {
      throw new ConflictException({
        code: 'PAYMENT_NOT_CONFIRMABLE',

        message:
          'The nomination payment is not awaiting cash confirmation.',
      });
    }

    /*
     * Recalculate actual membership coverage at
     * confirmation time.
     */
    const validation =
      await assertBoardNominationPayable(
        tx,
        application,
        confirmedAt,
      );

    const {
      nomination,

      membershipPlan,

      period,

      effectiveStartDate,

      effectiveEndDate,
    } = validation;

    /*
     * Confirm the payment.
     */
    const paymentUpdated =
      await tx.payment.updateMany({
        where: {
          id: payment.id,

          status: 'AWAITING_CASH',
        },

        data: {
          status: 'CONFIRMED',

          confirmedAt,

          confirmedByAccountId,
        },
      });

    if (paymentUpdated.count !== 1) {
      throw new ConflictException(
        'The payment state changed during confirmation.',
      );
    }

    /*
     * Mark the application paid.
     */
    const applicationUpdated =
      await tx.membershipApplication.updateMany({
        where: {
          id: application.id,

          status: 'PENDING_PAYMENT',
        },

        data: {
          status: 'PAID',

          paidAt: confirmedAt,

          endReason: null,

          canceledAt: null,

          processingGraceEndsAt: null,
        },
      });

    if (applicationUpdated.count !== 1) {
      throw new ConflictException(
        'The application state changed during confirmation.',
      );
    }

    /*
     * Immediate activation or prepaid renewal.
     *
     * The membership number is automatically generated
     * by the existing PostgreSQL default.
     */
    const membership =
      await tx.membership.create({
        data: {
          clubId: application.clubId,

          studentId: application.studentId,

          sourceApplicationId: application.id,

          sourcePaymentId: payment.id,

          activatedAt:
            membershipPlan.projectedActivatedAt,

          expiresAt:
            membershipPlan.projectedExpiresAt,

          confirmedPaymentAt: confirmedAt,
        },
      });

    /*
     * Confirm the persisted membership records
     * actually cover the required board term.
     */
    const finalCoverage =
      await evaluateBoardMembershipCoverage(
        tx,
        application.clubId,
        application.studentId,
        period,
      );

    if (!finalCoverage.fullyCovered) {
      throw new ConflictException({
        code: 'BOARD_COVERAGE_NOT_SATISFIED',

        message:
          'The resulting membership does not cover the board term.',
      });
    }

    /*
     * Only now may the official appointment exist.
     */
    const appointment =
      await tx.boardAppointment.create({
        data: {
          clubId: application.clubId,

          studentId: application.studentId,

          position: nomination.position,

          startDate: effectiveStartDate,

          endDate: effectiveEndDate,
        },
      });

    /*
     * Qualify the original nomination and link it
     * to its official board appointment.
     */
    const nominationUpdated =
      await tx.boardNomination.updateMany({
        where: {
          id: nomination.id,

          status: 'PENDING_PAYMENT',

          boardAppointmentId: null,
        },

        data: {
          status: 'QUALIFIED',

          qualifiedAt: confirmedAt,

          boardAppointmentId: appointment.id,
        },
      });

    if (nominationUpdated.count !== 1) {
      throw new ConflictException(
        'The nomination state changed during qualification.',
      );
    }

    const confirmedPayment =
      await tx.payment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
      });

    const paidApplication =
      await tx.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    const qualifiedNomination =
      await tx.boardNomination.findUniqueOrThrow({
        where: {
          id: nomination.id,
        },
      });

    return {
      payment: confirmedPayment,

      application: paidApplication,

      membership,

      appointment,

      nomination: qualifiedNomination,

      alreadyConfirmed: false,
    };
  }
}