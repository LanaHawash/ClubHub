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
  calculateMembershipExpiration,
} from '../../shared/membership/membership-time';

interface ConfirmOrdinaryPaymentInput {
  application: MembershipApplication;
  payment: Payment;
  confirmedAt: Date;
  confirmedByAccountId: string | null;
}

@Injectable()
export class PaymentConfirmationService {
  /**
   * Finalizes an already-authorized ordinary membership payment.
   *
   * The caller must:
   * - Open a database transaction.
   * - Acquire the required membership locks.
   * - Validate payment authorization.
   * - Validate the applicable payment deadline.
   *
   * This service never trusts amounts supplied by a client.
   */
  async confirmOrdinaryPayment(
    tx: MembershipTransaction,
    input: ConfirmOrdinaryPaymentInput,
  ) {
    const {
      application,
      payment,
      confirmedAt,
      confirmedByAccountId,
    } = input;

    if (application.kind !== 'ORDINARY') {
      throw new ConflictException(
        'An ordinary membership application is required.',
      );
    }

    if (
      payment.membershipApplicationId !== application.id ||
      payment.eventRegistrationId !== null
    ) {
      throw new ConflictException(
        'Payment does not belong to this membership application.',
      );
    }

    if (
      !payment.amount.equals(application.quotedAmount) ||
      payment.currency !== application.currency
    ) {
      throw new ConflictException({
        code: 'PAYMENT_AMOUNT_MISMATCH',
        message:
          'The payment does not match the application quote.',
      });
    }

    /*
     * Idempotent confirmation.
     *
     * Return the existing membership without changing
     * its activation date or original confirmer.
     */
    if (
      application.status === 'PAID' &&
      payment.status === 'CONFIRMED'
    ) {
      const existingMembership =
        await tx.membership.findUnique({
          where: {
            sourceApplicationId: application.id,
          },
        });

      if (
        !existingMembership ||
        existingMembership.sourcePaymentId !== payment.id
      ) {
        throw new ConflictException(
          'Confirmed payment membership records are inconsistent.',
        );
      }

      return {
        payment,
        application,
        membership: existingMembership,
        alreadyConfirmed: true,
      };
    }

    /*
     * Validate the method-specific state.
     */
    if (payment.method === 'IN_PERSON') {
      if (
        payment.provider !== 'MANUAL' ||
        payment.status !== 'AWAITING_CASH' ||
        application.status !== 'PENDING_PAYMENT' ||
        !confirmedByAccountId
      ) {
        throw new ConflictException(
          'Cash payment cannot be confirmed in its current state.',
        );
      }
    } else {
      if (
        payment.status !== 'PROCESSING' ||
        application.status !== 'PAYMENT_PROCESSING' ||
        confirmedByAccountId !== null ||
        payment.provider === 'MANUAL'
      ) {
        throw new ConflictException(
          'Online payment cannot be confirmed in its current state.',
        );
      }
    }

    const activatedAt = confirmedAt;

    const expiresAt =
      calculateMembershipExpiration(
        activatedAt,
      );

    /*
     * Reject any overlapping membership interval.
     *
     * The PostgreSQL exclusion constraint provides
     * additional protection at the database level.
     */
    const overlappingMembership =
      await tx.membership.findFirst({
        where: {
          clubId: application.clubId,
          studentId: application.studentId,

          activatedAt: {
            lt: expiresAt,
          },

          expiresAt: {
            gt: activatedAt,
          },
        },

        select: {
          id: true,
        },
      });

    if (overlappingMembership) {
      throw new ConflictException({
        code: 'MEMBERSHIP_INTERVAL_OVERLAP',
        message:
          'The student already has overlapping membership coverage.',
      });
    }

    /*
     * Conditionally update the payment.
     */
    const paymentUpdate =
      await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: payment.status,
        },

        data: {
          status: 'CONFIRMED',
          confirmedAt,
          confirmedByAccountId,
        },
      });

    if (paymentUpdate.count !== 1) {
      throw new ConflictException(
        'Payment state changed during confirmation.',
      );
    }

    /*
     * Conditionally update the application.
     */
    const applicationUpdate =
      await tx.membershipApplication.updateMany({
        where: {
          id: application.id,
          status: application.status,
        },

        data: {
          status: 'PAID',
          paidAt: confirmedAt,
          endReason: null,
          canceledAt: null,
        },
      });

    if (applicationUpdate.count !== 1) {
      throw new ConflictException(
        'Application state changed during confirmation.',
      );
    }

    /*
     * PostgreSQL generates membershipNumber using
     * generate_membership_number().
     */
    const membership =
      await tx.membership.create({
        data: {
          clubId: application.clubId,
          studentId: application.studentId,

          sourceApplicationId: application.id,
          sourcePaymentId: payment.id,

          activatedAt,
          expiresAt,

          confirmedPaymentAt: confirmedAt,
        },
      });

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

    return {
      payment: confirmedPayment,
      application: paidApplication,
      membership,
      alreadyConfirmed: false,
    };
  }
}