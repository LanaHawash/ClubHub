import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  PrismaService,
} from '../../shared/prisma/prisma.service';

import {
  reconcileApplicationById,
  reconcileStudentClubApplications,
} from '../../shared/membership/membership-lifecycle';

@Injectable()
export class MembershipLifecycleService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger =
    new Logger(MembershipLifecycleService.name);

  private timer:
    ReturnType<typeof setInterval> | null = null;

  private running = false;

  private stopping = false;

  private activeRun: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,

    private readonly config: ConfigService =
      new ConfigService(),
  ) {}

  onApplicationBootstrap(): void {
    const enabled =
      this.config.get<string>(
        'ENABLE_MEMBERSHIP_RECONCILIATION',
      ) !== 'false';

    if (!enabled) {
      this.logger.log(
        'Automatic membership reconciliation is disabled.',
      );

      return;
    }

    const configuredInterval = Number(
      this.config.get<string>(
        'MEMBERSHIP_RECONCILIATION_INTERVAL_MS',
      ) ?? '60000',
    );

    const interval =
      Number.isSafeInteger(configuredInterval) &&
      configuredInterval >= 10000 &&
      configuredInterval <= 3600000
        ? configuredInterval
        : 60000;

    this.stopping = false;

    this.timer = setInterval(() => {
      this.startReconciliation();
    }, interval);

    this.timer.unref();

    this.logger.log(
      `Automatic membership reconciliation enabled (${interval} ms interval).`,
    );

    /*
     * Reconcile overdue records shortly after
     * application startup as well.
     */
    this.startReconciliation();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearInterval(this.timer);

      this.timer = null;
    }

    if (this.activeRun) {
      await this.activeRun;
    }
  }

  private startReconciliation(): void {
    if (this.running || this.stopping) {
      return;
    }

    this.running = true;

    this.activeRun = this.runScheduledReconciliation()
      .catch((error: unknown) => {
        this.logger.error(
          'Membership lifecycle reconciliation failed.',
          error instanceof Error
            ? error.stack
            : undefined,
        );
      })
      .finally(() => {
        this.running = false;
        this.activeRun = null;
      });
  }

  async reconcileApplication(
    applicationId: string,
  ) {
    return reconcileApplicationById(
      this.prisma,
      applicationId,
    );
  }

  async reconcileStudentClubApplications(
    studentId: string,
    clubId: string,
  ) {
    return reconcileStudentClubApplications(
      this.prisma,
      studentId,
      clubId,
    );
  }

  /**
   * Process a bounded batch of applications whose
   * nominal deadline or processing grace has ended.
   */
  async reconcileDueApplications(
    batchSize = 100,
  ) {
    const limit = Math.min(
      500,
      Math.max(
        1,
        Number.isFinite(batchSize)
          ? Math.floor(batchSize)
          : 100,
      ),
    );

    const clock =
      await this.prisma.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
      `;

    const now = clock[0].now;

    const applications =
      await this.prisma.membershipApplication.findMany({
        where: {
          kind: 'ORDINARY',

          OR: [
            {
              status: 'PENDING_PAYMENT',

              paymentDeadlineAt: {
                lte: now,
              },
            },

            {
              status: 'PAYMENT_PROCESSING',

              OR: [
                {
                  processingGraceEndsAt: {
                    lte: now,
                  },
                },

                {
                  processingGraceEndsAt: null,

                  paymentDeadlineAt: {
                    lte: now,
                  },
                },
              ],
            },
          ],
        },

        select: {
          id: true,
        },

        orderBy: [
          {
            paymentDeadlineAt: 'asc',
          },

          {
            id: 'asc',
          },
        ],

        take: limit,
      });

    let changed = 0;

    let failed = 0;

    for (const application of applications) {
      if (this.stopping) {
        break;
      }

      try {
        const result =
          await this.reconcileApplication(
            application.id,
          );

        if (result?.changed) {
          changed++;
        }
      } catch (error) {
        failed++;

        this.logger.error(
          `Failed to reconcile application ${application.id}.`,
          error instanceof Error
            ? error.stack
            : undefined,
        );
      }
    }

    return {
      scanned: applications.length,

      changed,

      failed,
    };
  }

  private async runScheduledReconciliation() {
    const result =
      await this.reconcileDueApplications(100);

    if (
      result.changed > 0 ||
      result.failed > 0
    ) {
      this.logger.log(
        `Membership reconciliation: scanned=${result.scanned}, changed=${result.changed}, failed=${result.failed}.`,
      );
    }
  }
}