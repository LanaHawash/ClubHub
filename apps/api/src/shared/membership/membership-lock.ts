import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export type MembershipTransaction = Prisma.TransactionClient;

/**
 * Locks the club row for the duration of the transaction.
 *
 * The transaction must acquire locks consistently:
 *
 * 1. Club
 * 2. ClubMembershipSettings
 * 3. Registration window, when applicable
 * 4. Student/club membership key
 * 5. Application, payment and nomination records
 */
export async function lockMembershipClub(
  tx: MembershipTransaction,
  clubId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Club"
    WHERE "id" = ${clubId}::uuid
    FOR UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException('Club not found.');
  }
}

/**
 * Locks the authoritative membership settings for a club.
 *
 * Coordinates Sprint 6 membership operations with the
 * existing Sprint 5 fee and registration lifecycle.
 */
export async function lockMembershipSettings(
  tx: MembershipTransaction,
  clubId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "ClubMembershipSettings"
    WHERE "clubId" = ${clubId}::uuid
    FOR UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException(
      'Club membership settings not found.',
    );
  }
}

/**
 * Locks a registration window belonging to the specified club.
 */
export async function lockMembershipRegistrationWindow(
  tx: MembershipTransaction,
  clubId: string,
  windowId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "ClubRegistrationWindow"
    WHERE "id" = ${windowId}::uuid
      AND "clubId" = ${clubId}::uuid
    FOR UPDATE
  `;

  if (rows.length === 0) {
    throw new NotFoundException(
      'Registration window not found.',
    );
  }
}

/**
 * Serializes membership operations for a particular student
 * and club, including when no application exists yet.
 *
 * PostgreSQL automatically releases this advisory lock
 * when the transaction commits or rolls back.
 */
export async function lockStudentClubMembership(
  tx: MembershipTransaction,
  clubId: string,
  studentId: string,
): Promise<void> {
  const lockKey = `clubhub:membership:${clubId}:${studentId}`;

  await tx.$queryRaw<{ locked: boolean }[]>`
    SELECT TRUE AS locked
    FROM pg_advisory_xact_lock(
      hashtextextended(${lockKey}, 0::bigint)
    )
  `;
}

/**
 * Reads authoritative PostgreSQL time.
 *
 * Call this after acquiring the necessary transaction locks
 * so time spent waiting for a lock does not allow an expired
 * application or payment to proceed.
 */
export async function getMembershipTransactionTime(
  tx: MembershipTransaction,
): Promise<Date> {
  const rows = await tx.$queryRaw<{ now: Date }[]>`
    SELECT clock_timestamp() AS now
  `;

  return rows[0].now;
}

/**
 * Serializes provider callbacks sharing the same
 * provider event identity.
 *
 * Acquire this lock before membership-related locks.
 */
export async function lockProviderEventIdentity(
  tx: MembershipTransaction,
  provider: string,
  providerEventId: string,
): Promise<void> {
  const lockKey =
    `clubhub:provider-event:${provider}:${providerEventId}`;

  await tx.$queryRaw<{ locked: boolean }[]>`
    SELECT TRUE AS locked
    FROM pg_advisory_xact_lock(
      hashtextextended(
        ${lockKey},
        0::bigint
      )
    )
  `;
}