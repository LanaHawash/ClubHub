import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** Materializes window fee versions without requiring a website request. */
@Injectable()
export class MembershipWindowReconcilerService
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MembershipWindowReconcilerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), 5_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const clubs = await this.prisma.$queryRaw<{ clubId: string }[]>`
        SELECT DISTINCT "clubId"
        FROM "ClubRegistrationWindow"
WHERE "opensAt" <= clock_timestamp()
  AND "effectiveFeeVersionId" IS NULL
  AND "canceledAt" IS NULL
      `;
      for (const { clubId } of clubs) {
        try {
          await this.prisma.$queryRaw<{ snapshot_due_membership_windows: number }[]>`
            SELECT snapshot_due_membership_windows(${clubId}::uuid)
          `;
        } catch (error) {
          this.logger.error(`Unable to materialize membership windows for club ${clubId}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Membership snapshot reconciliation failed', error);
    } finally {
      this.running = false;
    }
  }
}