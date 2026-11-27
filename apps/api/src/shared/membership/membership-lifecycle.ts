import type {
  MembershipApplication,
  ApplicationEndReason,
} from '../../generated/prisma/client';

import type {
  MembershipTransaction,
} from './membership-lock';
import {
  calculateEarlyClosureGraceDeadline,
} from './membership-time';
import {
  calculateOnlineGraceDeadline,
} from './membership-time';
import type {
  PrismaService,
} from '../prisma/prisma.service';

import {
  lockMembershipClub,
  lockMembershipSettings,
  lockMembershipRegistrationWindow,
  lockStudentClubMembership,
  getMembershipTransactionTime,
} from './membership-lock';
import {
  reconcileBoardNominationApplication,
} from './board-nomination-lifecycle';

export interface LifecycleReconciliationResult {
  applicationId: string;

  changed: boolean;

  status:
    | 'PENDING_PAYMENT'
    | 'PAYMENT_PROCESSING'
    | 'PAID'
    | 'EXPIRED'
    | 'CANCELED';

  endReason: ApplicationEndReason | null;
}

/**
 * Expire an unpaid ordinary membership application.
 *
 * The caller must hold the appropriate membership locks
 * and execute this function inside a transaction.
 */
export async function expireOrdinaryApplication(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
  reason: ApplicationEndReason,
): Promise<LifecycleReconciliationResult> {
  if (
    application.kind !== 'ORDINARY' ||
    (
      application.status !== 'PENDING_PAYMENT' &&
      application.status !== 'PAYMENT_PROCESSING'
    )
  ) {
    return {
      applicationId: application.id,
      changed: false,
      status: application.status,
      endReason: application.endReason,
    };
  }

  const changed =
    await tx.membershipApplication.updateMany({
      where: {
        id: application.id,

        status: application.status,
      },

      data: {
        status: 'EXPIRED',

        endReason: reason,
      },
    });

  if (changed.count !== 1) {
    const current =
      await tx.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    return {
      applicationId: current.id,
      changed: false,
      status: current.status,
      endReason: current.endReason,
    };
  }

  /*
   * Cash payments cannot continue after expiration.
   */
  await tx.payment.updateMany({
    where: {
      membershipApplicationId: application.id,

      method: 'IN_PERSON',

      status: 'AWAITING_CASH',
    },

    data: {
      status: 'EXPIRED',
    },
  });

  /*
   * Online payments must retain their financial history.
   * Expiration does not establish that no charge occurred.
   */
  await tx.payment.updateMany({
    where: {
      membershipApplicationId: application.id,

      method: 'ONLINE',

      status: 'PROCESSING',
    },

    data: {
      status: 'EXPIRED',
    },
  });

  await tx.paymentAttempt.updateMany({
    where: {
      payment: {
        membershipApplicationId: application.id,

        method: 'ONLINE',
      },

      status: {
        in: [
          'INITIATED',
          'PROCESSING',
          'UNKNOWN',
        ],
      },
    },

    data: {
      status: 'EXPIRED',

      resolvedAt: now,
    },
  });

  return {
    applicationId: application.id,

    changed: true,

    status: 'EXPIRED',

    endReason: reason,
  };
}

/**
 * Cancel an ordinary application after an authoritative
 * administrative lifecycle change.
 *
 * Unlike normal expiration, this operation does not grant
 * an additional online processing grace period.
 */
export async function cancelOrdinaryApplication(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
  reason: ApplicationEndReason,
): Promise<LifecycleReconciliationResult> {
  if (
    application.kind !== 'ORDINARY' ||
    (
      application.status !== 'PENDING_PAYMENT' &&
      application.status !== 'PAYMENT_PROCESSING'
    )
  ) {
    return {
      applicationId: application.id,
      changed: false,
      status: application.status,
      endReason: application.endReason,
    };
  }

  const updated =
    await tx.membershipApplication.updateMany({
      where: {
        id: application.id,

        status: application.status,
      },

      data: {
        status: 'CANCELED',

        canceledAt: now,

        endReason: reason,
      },
    });

  if (updated.count !== 1) {
    const current =
      await tx.membershipApplication.findUniqueOrThrow({
        where: {
          id: application.id,
        },
      });

    return {
      applicationId: current.id,
      changed: false,
      status: current.status,
      endReason: current.endReason,
    };
  }

  await tx.payment.updateMany({
    where: {
      membershipApplicationId: application.id,

      status: {
        in: [
          'AWAITING_CASH',
          'PROCESSING',
        ],
      },
    },

    data: {
      status: 'EXPIRED',
    },
  });

  await tx.paymentAttempt.updateMany({
    where: {
      payment: {
        membershipApplicationId: application.id,
      },

      status: {
        in: [
          'INITIATED',
          'PROCESSING',
          'UNKNOWN',
        ],
      },
    },

    data: {
      status: 'EXPIRED',

      resolvedAt: now,
    },
  });

  return {
    applicationId: application.id,

    changed: true,

    status: 'CANCELED',

    endReason: reason,
  };
 
}
 /**
 * Reconciles the current lifecycle state of an ordinary
 * membership application.
 *
 * Must run inside a transaction under membership locks.
 */
export async function reconcileOrdinaryApplication(
  tx: MembershipTransaction,
  application: MembershipApplication,
  now: Date,
): Promise<LifecycleReconciliationResult> {
  const unchanged = (): LifecycleReconciliationResult => ({
    applicationId: application.id,

    changed: false,

    status: application.status,

    endReason: application.endReason,
  });

  if (
    application.kind !== 'ORDINARY' ||
    (
      application.status !== 'PENDING_PAYMENT' &&
      application.status !== 'PAYMENT_PROCESSING'
    )
  ) {
    return unchanged();
  }

  const club =
    await tx.club.findUniqueOrThrow({
      where: {
        id: application.clubId,
      },

      include: {
        membershipSettings: true,
      },
    });

  /*
   * Archive invalidates ordinary unpaid applications.
   */
  if (club.status !== 'ACTIVE') {
    return cancelOrdinaryApplication(
      tx,
      application,
      now,
      'CLUB_ARCHIVED',
    );
  }

  /*
   * A changed registration mode must not allow an old
   * application to remain payable.
   */
  if (
    !club.membershipSettings ||
    club.membershipSettings.registrationMode !==
      application.registrationModeAtSubmission
  ) {
    return cancelOrdinaryApplication(
      tx,
      application,
      now,
      'POLICY_SWITCH',
    );
  }

  let nominalDeadline =
    application.paymentDeadlineAt;

  let expirationReason: ApplicationEndReason =
    'TIMEOUT';

  let earlyClosedAt: Date | null = null;

  if (
    application.registrationModeAtSubmission ===
    'WINDOWED'
  ) {
    if (!application.registrationWindowId) {
      return cancelOrdinaryApplication(
        tx,
        application,
        now,
        'POLICY_SWITCH',
      );
    }

    const window =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          id: application.registrationWindowId,

          clubId: application.clubId,
        },
      });

    if (!window || window.canceledAt) {
      return cancelOrdinaryApplication(
        tx,
        application,
        now,
        'WINDOW_CLOSED',
      );
    }

    expirationReason = 'WINDOW_CLOSED';

    nominalDeadline = new Date(
      Math.min(
        nominalDeadline.getTime(),
        window.closesAt.getTime(),
      ),
    );

    if (
      window.closedAt &&
      window.closedAt < window.closesAt
    ) {
      earlyClosedAt = window.closedAt;

      expirationReason = 'EARLY_WINDOW_CLOSE';

      nominalDeadline = new Date(
        Math.min(
          nominalDeadline.getTime(),
          window.closedAt.getTime(),
        ),
      );
    }
  }

  /*
   * Ordinary pending applications receive no grace.
   * This includes awaiting-cash applications.
   */
  if (
    application.status === 'PENDING_PAYMENT'
  ) {
    if (now >= nominalDeadline) {
      return expireOrdinaryApplication(
        tx,
        application,
        now,
        expirationReason,
      );
    }

    return unchanged();
  }

  /*
   * Only an unresolved online attempt initiated before
   * the effective cutoff may receive processing grace.
   */
  const attempt =
    await tx.paymentAttempt.findFirst({
      where: {
        payment: {
          membershipApplicationId: application.id,

          method: 'ONLINE',

          status: 'PROCESSING',
        },

        status: {
          in: [
            'INITIATED',
            'PROCESSING',
            'UNKNOWN',
          ],
        },
      },

      orderBy: {
        initiatedAt: 'desc',
      },
    });

  if (
    !attempt ||
    attempt.initiatedAt >= nominalDeadline
  ) {
    return expireOrdinaryApplication(
      tx,
      application,
      now,
      expirationReason,
    );
  }

  let graceCutoff =
    attempt.processingGraceEndsAt;

  if (application.processingGraceEndsAt) {
    graceCutoff = new Date(
      Math.min(
        graceCutoff.getTime(),
        application.processingGraceEndsAt.getTime(),
      ),
    );
  }

  if (earlyClosedAt) {
    graceCutoff =
      calculateEarlyClosureGraceDeadline(
        earlyClosedAt,
        graceCutoff,
      );
  }

  if (now >= graceCutoff) {
    return expireOrdinaryApplication(
      tx,
      application,
      now,
      expirationReason,
    );
  }

  return unchanged();
}
/**
 * Cancels all live ordinary applications belonging
 * to a club during an administrative lifecycle change.
 *
 * Caller must hold the club and applicable settings locks.
 */
export async function cancelClubOrdinaryApplications(
  tx: MembershipTransaction,
  clubId: string,
  now: Date,
  reason: 'CLUB_ARCHIVED' | 'POLICY_SWITCH',
): Promise<number> {
  const applications =
    await tx.membershipApplication.findMany({
      where: {
        clubId,

        kind: 'ORDINARY',

        status: {
          in: [
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
          ],
        },
      },

      orderBy: {
        id: 'asc',
      },
    });

  let canceledCount = 0;

  for (const application of applications) {
    const result =
      await cancelOrdinaryApplication(
        tx,
        application,
        now,
        reason,
      );

    if (result.changed) {
      canceledCount++;
    }
  }
/*
 * Prevent previously expired online applications
 * from being restored through delayed callbacks
 * after an administrative invalidation.
 */
await tx.membershipApplication.updateMany({
  where: {
    clubId,

    kind: 'ORDINARY',

    status: 'EXPIRED',

    endReason: {
      in: [
        'TIMEOUT',
        'WINDOW_CLOSED',
        'EARLY_WINDOW_CLOSE',
      ],
    },

    payments: {
      some: {
        method: 'ONLINE',

        status: 'EXPIRED',

        attempts: {
          some: {
            status: 'EXPIRED',
          },
        },
      },
    },
  },

  data: {
    status: 'CANCELED',

    canceledAt: now,

    endReason: reason,
  },
});
  return canceledCount;
}
/**
 * Extends live ordinary applications belonging to
 * the same currently active registration window.
 *
 * Does not restore expired or canceled applications.
 * Does not modify frozen fees or original deadlines.
 */
export async function extendWindowApplicationDeadlines(
  tx: MembershipTransaction,
  clubId: string,
  windowId: string,
  newDeadline: Date,
  now: Date,
): Promise<number> {
  const applications =
    await tx.membershipApplication.findMany({
      where: {
        clubId,

        registrationWindowId: windowId,

        kind: 'ORDINARY',

        registrationModeAtSubmission:
          'WINDOWED',

        status: {
          in: [
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
          ],
        },

        paymentDeadlineAt: {
          gt: now,
          lt: newDeadline,
        },
      },

      orderBy: {
        id: 'asc',
      },
    });

  let extendedCount = 0;

  for (const application of applications) {
    if (
      application.status ===
      'PENDING_PAYMENT'
    ) {
      await tx.membershipApplication.update({
        where: {
          id: application.id,
        },

        data: {
          paymentDeadlineAt: newDeadline,
        },
      });

      extendedCount++;

      continue;
    }

    /*
     * An existing qualifying online attempt also
     * receives the extended processing cutoff.
     */
    const attempt =
      await tx.paymentAttempt.findFirst({
        where: {
          payment: {
            membershipApplicationId:
              application.id,

            method: 'ONLINE',

            status: 'PROCESSING',
          },

          status: {
            in: [
              'INITIATED',
              'PROCESSING',
              'UNKNOWN',
            ],
          },
        },

        orderBy: {
          initiatedAt: 'desc',
        },
      });

    if (
      !attempt ||
      attempt.initiatedAt >=
        application.paymentDeadlineAt
    ) {
      continue;
    }

    const newGraceCutoff =
      calculateOnlineGraceDeadline(
        newDeadline,
      );

    await tx.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        paymentDeadlineAt: newDeadline,

        processingGraceEndsAt:
          newGraceCutoff,
      },
    });

    await tx.paymentAttempt.update({
      where: {
        id: attempt.id,
      },

      data: {
        nominalDeadlineAt:
          newDeadline,

        processingGraceEndsAt:
          newGraceCutoff,
      },
    });

    extendedCount++;
  }

  return extendedCount;
}
/**
 * Reconciles applications immediately after the
 * original registration window is closed early.
 */
export async function reconcileEarlyClosedWindowApplications(
  tx: MembershipTransaction,
  clubId: string,
  windowId: string,
  closedAt: Date,
): Promise<number> {
  const applications =
    await tx.membershipApplication.findMany({
      where: {
        clubId,

        registrationWindowId:
          windowId,

        kind: 'ORDINARY',

        status: {
          in: [
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
          ],
        },
      },

      orderBy: {
        id: 'asc',
      },
    });

  let changedCount = 0;

  for (const application of applications) {
    /*
     * Pending applications and cash payments
     * expire immediately after early closure.
     */
    if (
      application.status ===
      'PENDING_PAYMENT'
    ) {
      const result =
        await expireOrdinaryApplication(
          tx,
          application,
          closedAt,
          'EARLY_WINDOW_CLOSE',
        );

      if (result.changed) {
        changedCount++;
      }

      continue;
    }

    const attempt =
      await tx.paymentAttempt.findFirst({
        where: {
          payment: {
            membershipApplicationId:
              application.id,

            method: 'ONLINE',

            status: 'PROCESSING',
          },

          status: {
            in: [
              'INITIATED',
              'PROCESSING',
              'UNKNOWN',
            ],
          },
        },

        orderBy: {
          initiatedAt: 'desc',
        },
      });

    /*
     * Only an existing attempt initiated before
     * closure can retain processing grace.
     */
    if (
      !attempt ||
      attempt.initiatedAt >= closedAt
    ) {
      const result =
        await expireOrdinaryApplication(
          tx,
          application,
          closedAt,
          'EARLY_WINDOW_CLOSE',
        );

      if (result.changed) {
        changedCount++;
      }

      continue;
    }

    const existingGraceCutoff =
      application.processingGraceEndsAt
        ? new Date(
            Math.min(
              application.processingGraceEndsAt.getTime(),
              attempt.processingGraceEndsAt.getTime(),
            ),
          )
        : attempt.processingGraceEndsAt;

    const shortenedGraceCutoff =
      calculateEarlyClosureGraceDeadline(
        closedAt,
        existingGraceCutoff,
      );

    if (shortenedGraceCutoff <= closedAt) {
      const result =
        await expireOrdinaryApplication(
          tx,
          application,
          closedAt,
          'EARLY_WINDOW_CLOSE',
        );

      if (result.changed) {
        changedCount++;
      }

      continue;
    }

    /*
     * Persist the shortened application-level grace.
     *
     * Keep the attempt's original nominal deadline
     * for chronology and provider auditing.
     */
    await tx.membershipApplication.update({
      where: {
        id: application.id,
      },

      data: {
        processingGraceEndsAt:
          shortenedGraceCutoff,
      },
    });

    changedCount++;
  }

  return changedCount;
}
/**
 * Reconcile one ordinary application inside
 * its own locked database transaction.
 */
export async function reconcileApplicationById(
  prisma: PrismaService,
  applicationId: string,
): Promise<LifecycleReconciliationResult | null> {
  const initial =
    await prisma.membershipApplication.findUnique({
      where: {
        id: applicationId,
      },
    });

  if (!initial) {
    return null;
  }

  if (
  initial.status !== 'PENDING_PAYMENT' &&
  initial.status !== 'PAYMENT_PROCESSING'
) {
    return {
      applicationId: initial.id,
      changed: false,
      status: initial.status,
      endReason: initial.endReason,
    };
  }

  return prisma.$transaction(async (tx) => {
    await lockMembershipClub(
      tx,
      initial.clubId,
    );

    await lockMembershipSettings(
      tx,
      initial.clubId,
    );

    if (initial.registrationWindowId) {
      await lockMembershipRegistrationWindow(
        tx,
        initial.clubId,
        initial.registrationWindowId,
      );
    }

    await lockStudentClubMembership(
      tx,
      initial.clubId,
      initial.studentId,
    );

    const current =
      await tx.membershipApplication.findUnique({
        where: {
          id: applicationId,
        },
      });

    if (!current) {
      return null;
    }

    const now =
      await getMembershipTransactionTime(tx);

    if (current.kind === 'BOARD_ONBOARDING') {
  return reconcileBoardNominationApplication(
    tx,
    current,
    now,
  );
}

return reconcileOrdinaryApplication(
  tx,
  current,
  now,
);
  });
}

/**
 * Reconcile live ordinary applications for one
 * authenticated student's club membership state.
 */
export async function reconcileStudentClubApplications(
  prisma: PrismaService,
  studentId: string,
  clubId: string,
) {
  const applications =
    await prisma.membershipApplication.findMany({
      where: {
        studentId,
        clubId,
        

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

  const results: LifecycleReconciliationResult[] = [];

  for (const application of applications) {
    const result =
      await reconcileApplicationById(
        prisma,
        application.id,
      );

    if (result) {
      results.push(result);
    }
  }

  return results;
}