import {
  evaluateMembershipCoverage,
} from './membership-coverage';

import type {
  MembershipCoverageResult,
} from './membership-coverage';

import type {
  MembershipTransaction,
} from './membership-lock';

import type {
  BoardCoveragePeriod,
} from './board-term';

export type BoardCoverageDecision =
  | 'DIRECT_APPOINTMENT'
  | 'NOMINATION_REQUIRED';

export type BoardCoverageReason =
  | 'NO_MEMBERSHIP'
  | 'INSUFFICIENT_COVERAGE'
  | null;

export interface BoardMembershipCoverageResult
  extends MembershipCoverageResult {
  decision: BoardCoverageDecision;

  reason: BoardCoverageReason;

  hasMembershipHistory: boolean;

  requiredStartAt: Date;

  requiredEndAt: Date;

  membershipIds: string[];
}

/**
 * Evaluate actual membership coverage for a board term.
 *
 * Unpaid applications and unresolved payments
 * are never considered membership coverage.
 *
 * Caller must hold the club and student-club
 * membership locks if the result is used to
 * create or qualify an appointment.
 */
export async function evaluateBoardMembershipCoverage(
  tx: MembershipTransaction,
  clubId: string,
  studentId: string,
  period: BoardCoveragePeriod,
): Promise<BoardMembershipCoverageResult> {
  const memberships =
    await tx.membership.findMany({
      where: {
        clubId,

        studentId,
      },

      select: {
        id: true,

        activatedAt: true,

        expiresAt: true,
      },

      orderBy: {
        activatedAt: 'asc',
      },
    });

  const relevantMemberships =
    memberships.filter(
      membership =>
        membership.activatedAt < period.endAt &&
        membership.expiresAt > period.startAt,
    );

  const coverage =
    evaluateMembershipCoverage(
      relevantMemberships,

      period.startAt,

      period.endAt,
    );

  const reason: BoardCoverageReason =
    coverage.fullyCovered
      ? null
      : relevantMemberships.length === 0
        ? 'NO_MEMBERSHIP'
        : 'INSUFFICIENT_COVERAGE';

  return {
    ...coverage,

    decision: coverage.fullyCovered
      ? 'DIRECT_APPOINTMENT'
      : 'NOMINATION_REQUIRED',

    reason,

    hasMembershipHistory:
      memberships.length > 0,

    requiredStartAt:
      period.startAt,

    requiredEndAt:
      period.endAt,

    membershipIds:
      relevantMemberships.map(
        membership => membership.id,
      ),
  };
}