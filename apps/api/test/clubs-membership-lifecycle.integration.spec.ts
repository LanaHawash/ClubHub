import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClubsService } from '../src/modules/clubs/clubs.service';
import { CreateClubDto } from '../src/modules/clubs/dto/create-club.dto';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { jest } from '@jest/globals';
import { MembershipWindowReconcilerService } from '../src/modules/clubs/membership-window-reconciler.service';
import { EventsService } from '../src/modules/events/events.service';
import { BoardAppointmentsService } from '../src/modules/clubs/board-appointments.service';
import { ClubEligibilityService } from '../src/modules/clubs/club-eligibility.service';
/**
 * REAL PostgreSQL tests. Never run on clubhub_dev.
 * Uses unique immutable fixtures; does not try to delete protected windows/fee versions.
 */
describe('Sprint 5.D - PostgreSQL membership lifecycle', () => {
  let prisma: PrismaService;
  let service: ClubsService;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  function dto(suffix: string, mode: 'WINDOWED' | 'ALWAYS_OPEN' = 'WINDOWED'): CreateClubDto {
    return {
      name: `S5D lifecycle ${suffix}-${run}`,
      description: 'Isolated membership lifecycle integration fixture',
      contactEmail: `s5d-${suffix}-${run}@example.com`,
      classification: 'GENERAL',
      labelIds: [],
      newLabels: [],
      boardMembers: [],
      administrators: [],
      membership: {
        firstTimeFee: '40.00',
        renewalFee: '25.00',
        currency: 'ILS',
        registrationMode: mode,
        ...(mode === 'WINDOWED'
          ? { opensAt: '2099-01-01T00:00:00.000Z', closesAt: '2099-02-01T00:00:00.000Z' }
          : {}),
      },
    };
  }


function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}
function pauseAvailabilityAfterFeeResolution(targetService: ClubsService) {
  const feeResolutionReached = deferred();
  const continueAvailability = deferred();
  const target = targetService as unknown as {
    getEffectiveMembershipFees: (feeVersionId: string) => Promise<unknown>;
  };
  const original = target.getEffectiveMembershipFees.bind(targetService);
  const spy = jest.spyOn(target, 'getEffectiveMembershipFees')
    .mockImplementation(async (feeVersionId: string) => {
      const fees = await original(feeVersionId);
      feeResolutionReached.resolve();
      await continueAvailability.promise;
      return fees;
    });
  return {
    feeResolutionReached: feeResolutionReached.promise,
    release() { continueAvailability.resolve(); },
    restore() { spy.mockRestore(); },
  };
}

  // Converts the future seed window to an active interval. This edit is legal
  // because OLD.opensAt is in the future; never move an already-active window.
  async function createActiveWindow(suffix: string) {
    const created = await service.create(dto(suffix));
    const existing = await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: created.id },
    });
    const opensAt = new Date(Date.now() - 60_000);
    const closesAt = new Date(Date.now() + 60 * 60_000);
    const updated = await prisma.clubRegistrationWindow.update({
      where: { id: existing.id },
      data: { opensAt, closesAt },
    });
    return { clubId: created.id, windowId: updated.id, opensAt, closesAt };
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url || new URL(url).pathname.replace(/^\//, '') !== 'clubhub_test') {
      throw new Error('Safety guard: this integration test requires DATABASE_URL database clubhub_test.');
    }
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ClubsService(prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('concurrent activation requests link exactly one fee snapshot to one window', async () => {
    const { clubId, windowId, opensAt } = await createActiveWindow('parallel');
    const results = await Promise.all([
      service.activateRegistrationWindowFees(clubId, windowId),
      service.activateRegistrationWindowFees(clubId, windowId),
    ]);
    const stored = await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });
    const versions = await prisma.clubMembershipFeeVersion.findMany({
      where: { clubId },
    });
    expect(results[0].effectiveFeeVersionId).toBeTruthy();
    expect(results[1].effectiveFeeVersionId).toBe(stored.effectiveFeeVersionId);
    expect(versions).toHaveLength(1);
    expect(stored.effectiveFeeVersionId).toBe(versions[0].id);
    expect(versions[0].effectiveAt.toISOString()).toBe(opensAt.toISOString());
    expect(versions[0].firstTimeFee.toFixed(2)).toBe('40.00');
    expect(versions[0].renewalFee.toFixed(2)).toBe('25.00');
  });

  it('repeated activation preserves the same fee version', async () => {
    const { clubId, windowId } = await createActiveWindow('idempotent');
    const first = await service.activateRegistrationWindowFees(clubId, windowId);
    const second = await service.activateRegistrationWindowFees(clubId, windowId);
    expect(second.effectiveFeeVersionId).toBe(first.effectiveFeeVersionId);
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(1);
  });

  it('rejects activation of future windows without creating fees', async () => {
    const club = await service.create(dto('future'));
    const window = await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: club.id },
    });
    await expect(service.activateRegistrationWindowFees(club.id, window.id))
      .rejects.toThrow(ConflictException);
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId: club.id } })).toBe(0);
  });

  it('rejects cross-club activation and archived clubs', async () => {
    const a = await createActiveWindow('owner-a');
    const b = await service.create(dto('owner-b'));
    await expect(service.activateRegistrationWindowFees(b.id, a.windowId))
      .rejects.toThrow(NotFoundException);
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId: b.id } })).toBe(0);

    await prisma.club.update({ where: { id: a.clubId }, data: { status: 'ARCHIVED' } });
    await expect(service.activateRegistrationWindowFees(a.clubId, a.windowId))
      .rejects.toThrow(ConflictException);
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId: a.clubId } })).toBe(0);
  });

  it('rolls back a new fee version if its window linkage violates the FK', async () => {
    const { clubId, windowId } = await createActiveWindow('rollback');
    const before = await prisma.clubMembershipFeeVersion.count({ where: { clubId } });
    await expect(prisma.$transaction(async (tx) => {
      await tx.clubMembershipFeeVersion.create({
        data: {
          clubId,
          firstTimeFee: '40.00',
          renewalFee: '25.00',
          currency: 'ILS',
          effectiveAt: new Date(),
        },
      });
      // Wrong ID forces the window FK to fail after the fee version INSERT.
      await tx.clubRegistrationWindow.update({
        where: { id: windowId },
        data: { effectiveFeeVersionId: '00000000-0000-4000-8000-000000000001' },
      });
    })).rejects.toThrow();
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(before);
    const window = await prisma.clubRegistrationWindow.findUniqueOrThrow({ where: { id: windowId } });
    expect(window.effectiveFeeVersionId).toBeNull();
  });

  it('closing an activated window preserves the original immutable fee version', async () => {
    const { clubId, windowId } = await createActiveWindow('earlyclose');
    const locked = await service.activateRegistrationWindowFees(clubId, windowId);
    const closed = await service.closeRegistrationWindow(clubId, windowId);
    expect(closed.closedAt).not.toBeNull();
    expect(closed.effectiveFeeVersionId).toBe(locked.effectiveFeeVersionId);
    const availability = await service.getMembershipAvailability(clubId);
    expect(availability.registrationAvailable).toBe(false);
    expect(availability.status).toBe('CLOSED_EARLY');
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(1);
    await expect(prisma.clubRegistrationWindow.update({
      where: { id: windowId }, data: { closedAt: null },
    })).rejects.toThrow();
  });


it('allows next-window fee updates without changing an open window snapshot', async () => {
  const { clubId, windowId, opensAt } = await createActiveWindow('active-fee-update');
  const settings = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId } });

  // No availability request or manual activation: the DB must lock due prices before the edit.
  const saved = await service.updateMembershipFees(clubId, {
    firstTimeFee: '50.00', renewalFee: '30.00', configVersion: settings.configVersion,
  }, '00000000-0000-4000-8000-000000000001');
  expect(saved.message).toBe('Future membership fees saved.');

  const pending = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId } });
  expect(pending.pendingFirstTimeFee.toFixed(2)).toBe('50.00');
  expect(pending.pendingRenewalFee.toFixed(2)).toBe('30.00');
  expect(pending.configVersion).toBe(settings.configVersion + 1);

  const window = await prisma.clubRegistrationWindow.findUniqueOrThrow({ where: { id: windowId } });
  expect(window.effectiveFeeVersionId).not.toBeNull();
  const locked = await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
    where: { id: window.effectiveFeeVersionId! },
  });
  expect(locked.firstTimeFee.toFixed(2)).toBe('40.00');
  expect(locked.renewalFee.toFixed(2)).toBe('25.00');
  expect(locked.effectiveAt.toISOString()).toBe(opensAt.toISOString());
  expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(1);
});


it('locks the configured fees during window activation', async () => {
  const { clubId, windowId, opensAt } = await createActiveWindow('activation-fees');
  const activated = await service.activateRegistrationWindowFees(clubId, windowId);
  expect(activated.effectiveFeeVersionId).not.toBeNull();
  const feeVersion = await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
    where: { id: activated.effectiveFeeVersionId! },
  });
  expect(feeVersion.firstTimeFee.toFixed(2)).toBe('40.00');
  expect(feeVersion.renewalFee.toFixed(2)).toBe('25.00');
  expect(feeVersion.currency).toBe('ILS');
  expect(feeVersion.effectiveAt.toISOString()).toBe(opensAt.toISOString());
  expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(1);
});

it('rejects activation when registration closes before fee locking', async () => {
  const { clubId, windowId } = await createActiveWindow('close-before-lock');
  const closed = await service.closeRegistrationWindow(clubId, windowId);
  expect(closed.closedAt).not.toBeNull();
  await expect(service.activateRegistrationWindowFees(clubId, windowId))
    .rejects.toThrow(ConflictException);
  const availability = await service.getMembershipAvailability(clubId);
  expect(availability.status).toBe('CLOSED_EARLY');
  expect(availability.registrationAvailable).toBe(false);
  expect(availability.effectiveFees).toBeNull();
  expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(0);
});

it('does not expose registration availability for archived clubs', async () => {
  const { clubId, windowId } = await createActiveWindow('archived-availability');
  await prisma.club.update({ where: { id: clubId }, data: { status: 'ARCHIVED' } });
  const availability = await service.getMembershipAvailability(clubId);
  expect(availability.status).toBe('CLUB_ARCHIVED');
  expect(availability.registrationAvailable).toBe(false);
  expect(availability.effectiveFees).toBeNull();
  await expect(service.activateRegistrationWindowFees(clubId, windowId))
    .rejects.toThrow(ConflictException);
  expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(0);
});



it('waits for the settings lock, then safely updates next-window fees', async () => {
  const { clubId, windowId } = await createActiveWindow('fee-lock-contention');
  const settings = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId } });
  const releaseLock = deferred();
  const lockAcquired = deferred();
  let updateFinished = false;

  const holdingTransaction = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid FOR UPDATE
    `;
    lockAcquired.resolve();
    await releaseLock.promise;
  }, { timeout: 10000 });

  await lockAcquired.promise;
  const observedUpdate = service.updateMembershipFees(clubId, {
    firstTimeFee: '50.00', renewalFee: '30.00', configVersion: settings.configVersion,
  }, '00000000-0000-4000-8000-000000000001').then(
    (value) => { updateFinished = true; return { succeeded: true as const, value }; },
    (error: unknown) => { updateFinished = true; return { succeeded: false as const, error }; },
  );

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(updateFinished).toBe(false);
  } finally {
    releaseLock.resolve();
  }

  await holdingTransaction;
  const result = await observedUpdate;
  expect(result.succeeded).toBe(true);
  if (!result.succeeded) throw result.error;
  const saved = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId } });
  expect(saved.pendingFirstTimeFee.toFixed(2)).toBe('50.00');
  expect(saved.pendingRenewalFee.toFixed(2)).toBe('30.00');
  const window = await prisma.clubRegistrationWindow.findUniqueOrThrow({ where: { id: windowId } });
  expect(window.effectiveFeeVersionId).not.toBeNull();
  const locked = await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
    where: { id: window.effectiveFeeVersionId! },
  });
  expect(locked.firstTimeFee.toFixed(2)).toBe('40.00');
  expect(locked.renewalFee.toFixed(2)).toBe('25.00');
});

it('waits for the settings lock before activating registration', async () => {
  const { clubId, windowId } = await createActiveWindow('activation-lock-contention');
  const releaseLock = deferred();
  const lockAcquired = deferred();
  let activationFinished = false;
  const holdingTransaction = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid FOR UPDATE
    `;
    lockAcquired.resolve();
    await releaseLock.promise;
  }, { timeout: 10000 });
  await lockAcquired.promise;
  const activationAttempt = service.activateRegistrationWindowFees(clubId, windowId);
  const observedActivation = activationAttempt.then(
    (value) => { activationFinished = true; return value; },
    (error: unknown) => { activationFinished = true; throw error; },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(activationFinished).toBe(false);
    expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId } })).toBe(0);
  } finally {
    releaseLock.resolve();
  }
  await holdingTransaction;
  const activated = await observedActivation;
  expect(activated.effectiveFeeVersionId).not.toBeNull();
  const versions = await prisma.clubMembershipFeeVersion.findMany({ where: { clubId } });
  expect(versions).toHaveLength(1);
  expect(versions[0].id).toBe(activated.effectiveFeeVersionId);
  expect(versions[0].firstTimeFee.toFixed(2)).toBe('40.00');
  expect(versions[0].renewalFee.toFixed(2)).toBe('25.00');
});



it('preserves opening-time prices when the fee edit happens after opening', async () => {
  const club = await service.create(dto('opening-boundary'));
  const registrationWindow = await prisma.clubRegistrationWindow.findFirstOrThrow({
    where: { clubId: club.id },
  });
  const opensAt = new Date(Date.now() + 2_000);
  await prisma.clubRegistrationWindow.update({
    where: { id: registrationWindow.id },
    data: { opensAt, closesAt: new Date(opensAt.getTime() + 3_600_000) },
  });
  const settings = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId: club.id } });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, opensAt.getTime() - Date.now() + 200));
  });

  // The window opened without traffic: changing pending prices must first lock old prices.
  await service.updateMembershipFees(club.id, {
    firstTimeFee: '50.00', renewalFee: '30.00', configVersion: settings.configVersion,
  }, '00000000-0000-4000-8000-000000000001');
  const saved = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId: club.id } });
  expect(saved.pendingFirstTimeFee.toFixed(2)).toBe('50.00');
  expect(saved.pendingRenewalFee.toFixed(2)).toBe('30.00');
  const window = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: registrationWindow.id },
  });
  expect(window.effectiveFeeVersionId).not.toBeNull();
  const locked = await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
    where: { id: window.effectiveFeeVersionId! },
  });
  expect(locked.firstTimeFee.toFixed(2)).toBe('40.00');
  expect(locked.renewalFee.toFixed(2)).toBe('25.00');
  expect(locked.effectiveAt.toISOString()).toBe(opensAt.toISOString());
  const activated = await service.activateRegistrationWindowFees(club.id, registrationWindow.id);
  expect(activated.effectiveFeeVersionId).toBe(window.effectiveFeeVersionId);
  expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId: club.id } })).toBe(1);
});

it('locks updated pending fees when the change completes before opening', async () => {
  const club = await service.create(dto('pre-opening-fees'));
  const settings = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId: club.id } });
  await service.updateMembershipFees(club.id, {
    firstTimeFee: '50.00', renewalFee: '30.00', configVersion: settings.configVersion,
  }, '00000000-0000-4000-8000-000000000001');
  const saved = await prisma.clubMembershipSettings.findUniqueOrThrow({ where: { clubId: club.id } });
  expect(saved.pendingFirstTimeFee.toFixed(2)).toBe('50.00');
  expect(saved.pendingRenewalFee.toFixed(2)).toBe('30.00');
  const registrationWindow = await prisma.clubRegistrationWindow.findFirstOrThrow({ where: { clubId: club.id } });
  await prisma.clubRegistrationWindow.update({
    where: { id: registrationWindow.id },
    data: { opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 3_600_000) },
  });
  const activated = await service.activateRegistrationWindowFees(club.id, registrationWindow.id);
  const locked = await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
    where: { id: activated.effectiveFeeVersionId! },
  });
  expect(locked.firstTimeFee.toFixed(2)).toBe('50.00');
  expect(locked.renewalFee.toFixed(2)).toBe('30.00');
  expect(await prisma.clubMembershipFeeVersion.count({ where: { clubId: club.id } })).toBe(1);
});

it('returns CLOSED_EARLY when registration closes during availability resolution', async () => {
  const fixture = await createActiveWindow('availability-close-race');
  await service.activateRegistrationWindowFees(fixture.clubId, fixture.windowId);
  const availabilityService = new ClubsService(prisma);
  const checkpoint = pauseAvailabilityAfterFeeResolution(availabilityService);
  try {
    const availabilityPromise = availabilityService.getMembershipAvailability(fixture.clubId);
    await checkpoint.feeResolutionReached;
    await service.closeRegistrationWindow(fixture.clubId, fixture.windowId);
    checkpoint.release();
    const result = await availabilityPromise;
    expect(result.status).toBe('CLOSED_EARLY');
    expect(result.registrationAvailable).toBe(false);
    expect(result.effectiveFees).toBeNull();
    const persistedWindow = await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: fixture.windowId },
    });
    expect(persistedWindow.closedAt).not.toBeNull();
    expect(persistedWindow.effectiveFeeVersionId).not.toBeNull();
  } finally {
    checkpoint.release(); checkpoint.restore();
  }
});

it('returns CLUB_ARCHIVED when a windowed club is archived during availability resolution', async () => {
  const fixture = await createActiveWindow('availability-archive-windowed');
  await service.activateRegistrationWindowFees(fixture.clubId, fixture.windowId);
  const availabilityService = new ClubsService(prisma);
  const checkpoint = pauseAvailabilityAfterFeeResolution(availabilityService);
  try {
    const availabilityPromise = availabilityService.getMembershipAvailability(fixture.clubId);
    await checkpoint.feeResolutionReached;
    await service.archive(fixture.clubId);
    checkpoint.release();
    const result = await availabilityPromise;
    expect(result.status).toBe('CLUB_ARCHIVED');
    expect(result.registrationAvailable).toBe(false);
    expect(result.effectiveFees).toBeNull();
    expect(result.window).toBeNull();
    const persistedClub = await prisma.club.findUniqueOrThrow({
      where: { id: fixture.clubId }, select: { status: true },
    });
    expect(persistedClub.status).toBe('ARCHIVED');
    const persistedWindow = await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: fixture.windowId },
    });
    expect(persistedWindow.effectiveFeeVersionId).not.toBeNull();
  } finally {
    checkpoint.release(); checkpoint.restore();
  }
});

it('returns CLUB_ARCHIVED when an always-open club is archived during availability resolution', async () => {
  const created = await service.create(dto('availability-archive-always-open', 'ALWAYS_OPEN'));
  const availabilityService = new ClubsService(prisma);
  const checkpoint = pauseAvailabilityAfterFeeResolution(availabilityService);
  try {
    const availabilityPromise = availabilityService.getMembershipAvailability(created.id);
    await checkpoint.feeResolutionReached;
    await service.archive(created.id);
    checkpoint.release();
    const result = await availabilityPromise;
    expect(result.status).toBe('CLUB_ARCHIVED');
    expect(result.registrationAvailable).toBe(false);
    expect(result.effectiveFees).toBeNull();
    expect(result.window).toBeNull();
    const persistedClub = await prisma.club.findUniqueOrThrow({
      where: { id: created.id }, select: { status: true },
    });
    expect(persistedClub.status).toBe('ARCHIVED');
    const feeVersions = await prisma.clubMembershipFeeVersion.findMany({ where: { clubId: created.id } });
    expect(feeVersions).toHaveLength(1);
  } finally {
    checkpoint.release(); checkpoint.restore();
  }
});
it('recovers a missed registration opening without student traffic', async () => {
  const { clubId, windowId, opensAt } =
    await createActiveWindow('missed-opening-recovery');

  // Simulate a registration window that opened while
  // the API was offline.
  //
  // No availability request is made.
  // No manual activation is performed.

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(before.effectiveFeeVersionId).toBeNull();

  // Simulate the automatic reconciler running
  // after the application becomes available again.

  const firstRun = await prisma.$queryRaw<
    { snapshot_due_membership_windows: number }[]
  >`
    SELECT snapshot_due_membership_windows(${clubId}::uuid)
  `;

  expect(firstRun[0].snapshot_due_membership_windows).toBe(1);

  // Verify the correct historical prices were preserved.

  const recovered = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(recovered.effectiveFeeVersionId).not.toBeNull();

  const feeVersion = await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
    where: { id: recovered.effectiveFeeVersionId! },
  });

  expect(feeVersion.firstTimeFee.toFixed(2)).toBe('40.00');
  expect(feeVersion.renewalFee.toFixed(2)).toBe('25.00');

  // The effective date must match the original
  // scheduled opening time, not the recovery time.

  expect(feeVersion.effectiveAt.toISOString()).toBe(
    opensAt.toISOString(),
  );

  // Running recovery again must not produce
  // an additional fee version.

  const secondRun = await prisma.$queryRaw<
    { snapshot_due_membership_windows: number }[]
  >`
    SELECT snapshot_due_membership_windows(${clubId}::uuid)
  `;

  expect(secondRun[0].snapshot_due_membership_windows).toBe(0);

  const versions = await prisma.clubMembershipFeeVersion.findMany({
    where: { clubId },
  });

  expect(versions).toHaveLength(1);
  expect(versions[0].id).toBe(recovered.effectiveFeeVersionId);
});
it('rejects a fee transaction that commits after its window opens', async () => {
  const club = await service.create(dto('commit-boundary'));

  const window = await prisma.clubRegistrationWindow.findFirstOrThrow({
    where: { clubId: club.id },
  });

  // Schedule the opening sufficiently far in the future
  // to begin a controlled transaction before the boundary.
  const opensAt = new Date(Date.now() + 3_000);

  await prisma.clubRegistrationWindow.update({
    where: { id: window.id },
    data: {
      opensAt,
      closesAt: new Date(opensAt.getTime() + 3_600_000),
    },
  });

  const settings = await prisma.clubMembershipSettings.findUniqueOrThrow({
    where: { clubId: club.id },
  });

  // Begin changing pending fees BEFORE the window opens.
  // Deliberately keep the transaction open across the boundary.
  const attemptedUpdate = prisma.$transaction(
    async tx => {
      await tx.clubMembershipSettings.update({
        where: { clubId: club.id },
        data: {
          pendingFirstTimeFee: '50.00',
          pendingRenewalFee: '30.00',
          configVersion: { increment: 1 },
        },
      });

      // Confirm the mutation occurred before opening.
      const timestamp = await tx.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
      `;

      expect(timestamp[0].now.getTime()).toBeLessThan(
        opensAt.getTime(),
      );

      // Hold the transaction until after the window opens.
      await new Promise<void>(resolve => {
        setTimeout(
          resolve,
          Math.max(0, opensAt.getTime() - Date.now() + 200),
        );
      });
    },
    { timeout: 10_000 },
  );

  // PostgreSQL's deferred boundary trigger should reject
  // the transaction instead of allowing late fee changes.
  await expect(attemptedUpdate).rejects.toThrow();

  // A rejected transaction must preserve the original fees.
  const persistedSettings =
    await prisma.clubMembershipSettings.findUniqueOrThrow({
      where: { clubId: club.id },
    });

  expect(persistedSettings.pendingFirstTimeFee.toFixed(2)).toBe('40.00');
  expect(persistedSettings.pendingRenewalFee.toFixed(2)).toBe('25.00');
  expect(persistedSettings.configVersion).toBe(settings.configVersion);

  // Recover the missed opening and verify the original
  // prices become the immutable historical snapshot.
  await prisma.$queryRaw`
    SELECT snapshot_due_membership_windows(${club.id}::uuid)
  `;

  const recoveredWindow =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: window.id },
    });

  expect(recoveredWindow.effectiveFeeVersionId).not.toBeNull();

  const lockedFees =
    await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
      where: { id: recoveredWindow.effectiveFeeVersionId! },
    });

  expect(lockedFees.firstTimeFee.toFixed(2)).toBe('40.00');
  expect(lockedFees.renewalFee.toFixed(2)).toBe('25.00');
  expect(lockedFees.effectiveAt.toISOString()).toBe(
    opensAt.toISOString(),
  );

  expect(
    await prisma.clubMembershipFeeVersion.count({
      where: { clubId: club.id },
    }),
  ).toBe(1);
});
it('automatically recovers a missed window when the reconciler starts', async () => {
  const { clubId, windowId, opensAt } =
    await createActiveWindow('automatic-recovery');

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(before.effectiveFeeVersionId).toBeNull();

  // Start the actual background reconciler.
  // This simulates its initialization when the API starts.
  const reconciler = new MembershipWindowReconcilerService(prisma);

  try {
    reconciler.onModuleInit();

    // Wait for the asynchronous reconciliation to complete.
    // Poll instead of assuming a specific execution duration.
    let recoveredWindow = before;
    const deadline = Date.now() + 10_000;

    while (
      recoveredWindow.effectiveFeeVersionId === null &&
      Date.now() < deadline
    ) {
      await new Promise(resolve => setTimeout(resolve, 100));

      recoveredWindow =
        await prisma.clubRegistrationWindow.findUniqueOrThrow({
          where: { id: windowId },
        });
    }

    expect(recoveredWindow.effectiveFeeVersionId).not.toBeNull();

    const feeVersion =
      await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
        where: { id: recoveredWindow.effectiveFeeVersionId! },
      });

    expect(feeVersion.firstTimeFee.toFixed(2)).toBe('40.00');
    expect(feeVersion.renewalFee.toFixed(2)).toBe('25.00');

    expect(feeVersion.effectiveAt.toISOString()).toBe(
      opensAt.toISOString(),
    );

    expect(
      await prisma.clubMembershipFeeVersion.count({
        where: { clubId },
      }),
    ).toBe(1);
  } finally {
    reconciler.onModuleDestroy();
  }
});
it('enforces archived-club event visibility and restores it after reactivation', async () => {
  const club = await service.create(dto('archived-event-visibility'));

  const eventsService = new EventsService(prisma);

  const day = 24 * 60 * 60 * 1000;

  const today = new Date();
  const todayUtc = new Date(
    `${today.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );

  const pastStart = new Date(todayUtc.getTime() - 10 * day);
  const pastEnd = new Date(todayUtc.getTime() - 8 * day);

  const ongoingStart = new Date(todayUtc.getTime() - day);
  const ongoingEnd = new Date(todayUtc.getTime() + 3 * day);

  const upcomingStart = new Date(todayUtc.getTime() + 5 * day);

  const past = await prisma.event.create({
    data: {
      clubId: club.id,
      title: `Past event ${run}`,
      description: 'Historical event',
      category: 'WORKSHOP',
      status: 'PUBLISHED',
      startDate: pastStart,
      endDate: pastEnd,
    },
  });

  const ongoing = await prisma.event.create({
    data: {
      clubId: club.id,
      title: `Ongoing event ${run}`,
      description: 'Ongoing event',
      category: 'WORKSHOP',
      status: 'PUBLISHED',
      startDate: ongoingStart,
      endDate: ongoingEnd,
    },
  });

  const upcoming = await prisma.event.create({
    data: {
      clubId: club.id,
      title: `Upcoming event ${run}`,
      description: 'Future event',
      category: 'WORKSHOP',
      status: 'PUBLISHED',
      startDate: upcomingStart,
    },
  });

  // Before archiving, all published events are visible.

  const beforeArchive = await eventsService.findAll();

  expect(beforeArchive.some(event => event.id === past.id)).toBe(true);
  expect(beforeArchive.some(event => event.id === ongoing.id)).toBe(true);
  expect(beforeArchive.some(event => event.id === upcoming.id)).toBe(true);

  // Archive the club through the actual service.

  await service.archive(club.id);

  // Public discovery must retain historical events only.

  const afterArchive = await eventsService.findAll();

  expect(afterArchive.some(event => event.id === past.id)).toBe(true);
  expect(afterArchive.some(event => event.id === ongoing.id)).toBe(false);
  expect(afterArchive.some(event => event.id === upcoming.id)).toBe(false);

  // Direct access must follow the same visibility policy.

  await expect(eventsService.findOne(past.id)).resolves.toMatchObject({
    id: past.id,
  });

  await expect(eventsService.findOne(ongoing.id)).rejects.toThrow(
    NotFoundException,
  );

  await expect(eventsService.findOne(upcoming.id)).rejects.toThrow(
    NotFoundException,
  );

  // Reactivation restores visibility without recreating events.

  await service.activate(club.id);

  const afterReactivation = await eventsService.findAll();

  expect(afterReactivation.some(event => event.id === past.id)).toBe(true);
  expect(afterReactivation.some(event => event.id === ongoing.id)).toBe(true);
  expect(afterReactivation.some(event => event.id === upcoming.id)).toBe(true);

  // Confirm records were preserved throughout the lifecycle.

  const persistedEvents = await prisma.event.findMany({
    where: {
      clubId: club.id,
    },
  });

  expect(persistedEvents).toHaveLength(3);
});
it('prevents board appointment modifications for archived clubs', async () => {
  const club = await service.create(dto('archived-board-protection'));

  const boardService = new BoardAppointmentsService(
    prisma,
    new ClubEligibilityService(prisma),
  );

  // Create an isolated student fixture.
  const faculty = await prisma.faculty.create({
    data: {
      name: `Board test faculty ${run}`,
    },
  });

  const major = await prisma.major.create({
    data: {
      name: 'Board Test Major',
      facultyId: faculty.id,
    },
  });

  const student = await prisma.universityStudent.create({
    data: {
      universityId: `S5${Date.now().toString(36)}`,
      email: `board-test-${run}@example.com`,
      fullName: 'Board Test Student',
      majorId: major.id,
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  // Establish an existing board appointment.
  const appointment = await prisma.boardAppointment.create({
    data: {
      clubId: club.id,
      studentId: student.id,
      position: 'President',
      startDate: new Date(`${today}T00:00:00.000Z`),
    },
  });

  // Archive the club using the actual service.
  await service.archive(club.id);

  // 1. Creating a new appointment must fail.
  await expect(
    boardService.create(club.id, {
      studentId: student.id,
      position: 'Vice President',
      startDate: today,
    }),
  ).rejects.toThrow(ConflictException);

  // 2. Updating an existing appointment must fail.
  await expect(
    boardService.update(appointment.id, {
      position: 'Vice President',
    }),
  ).rejects.toThrow(ConflictException);

  // 3. Ending an existing appointment must fail.
  await expect(
    boardService.end(
      appointment.id,
      today,
      '00000000-0000-4000-8000-000000000001',
    ),
  ).rejects.toThrow(ConflictException);

  // 4. Verify no additional appointments were created.
  const appointments = await prisma.boardAppointment.findMany({
    where: {
      clubId: club.id,
    },
  });

  expect(appointments).toHaveLength(1);

  // 5. Verify the historical appointment was not modified.
  const preserved = await prisma.boardAppointment.findUniqueOrThrow({
    where: {
      id: appointment.id,
    },
  });

  expect(preserved.position).toBe('President');
  expect(preserved.endedAt).toBeNull();

  // 6. Deanship must still be able to access historical records.
  const history = await boardService.history(club.id);

  expect(
    history.some(record => record.id === appointment.id),
  ).toBe(true);
});
it('rejects board creation when a club is archived between validation and transaction', async () => {
  const club = await service.create(dto('board-archive-race'));

  const boardService = new BoardAppointmentsService(
    prisma,
    new ClubEligibilityService(prisma),
  );

  // Create an isolated eligible student.
  const faculty = await prisma.faculty.create({
    data: {
      name: `Race test faculty ${run}`,
    },
  });

  const major = await prisma.major.create({
    data: {
      name: 'Race Test Major',
      facultyId: faculty.id,
    },
  });

  const student = await prisma.universityStudent.create({
    data: {
      universityId: `R${Date.now().toString(36)}`,
      email: `race-${run}@example.com`,
      fullName: 'Race Test Student',
      majorId: major.id,
    },
  });

  await prisma.account.create({
    data: {
      email: student.email,
      passwordHash: 'integration-test-only',
      role: 'STUDENT',
      status: 'ACTIVE',
      universityStudentId: student.id,
    },
  });

const initialValidationFinished = deferred();
const continueCreation = deferred();

// Pause after eligibility validation completes,
// immediately before the database transaction begins.
const target = boardService as unknown as {
  assertEligible: (
    accountId: string,
    clubId: string
  ) => Promise<void>;
};

const originalAssertEligible =
  target.assertEligible.bind(boardService);

const spy = jest
  .spyOn(target, 'assertEligible')
  .mockImplementation(async (accountId, clubId) => {
    // Complete the real eligibility validation first.
    await originalAssertEligible(accountId, clubId);

    // Signal that all initial validations have passed.
    initialValidationFinished.resolve();

    // Hold execution immediately before the transaction.
    await continueCreation.promise;
  });

  try {
    const today = new Date().toISOString().slice(0, 10);

    const creationAttempt = boardService.create(club.id, {
      studentId: student.id,
      position: 'President',
      startDate: today,
    });

    // Observe the request after initial validation.
    await initialValidationFinished.promise;

    // Archive the club before allowing creation to continue.
    await service.archive(club.id);

    // The appointment request continues with stale
    // information from its first status check.
    continueCreation.resolve();

    // The transaction-level status check must reject it.
    await expect(creationAttempt).rejects.toThrow(
      ConflictException,
    );

    // Nothing should have been inserted.
    const appointments = await prisma.boardAppointment.findMany({
      where: {
        clubId: club.id,
      },
    });

    expect(appointments).toHaveLength(0);

    const persistedClub = await prisma.club.findUniqueOrThrow({
      where: {
        id: club.id,
      },
    });

    expect(persistedClub.status).toBe('ARCHIVED');
  } finally {
    continueCreation.resolve();
    spy.mockRestore();
  }
});
it('extends an active registration window without changing its identity or locked fees', async () => {
  const { clubId, windowId } =
    await createActiveWindow('active-extension');

  // Lock the window's membership prices.
  await service.activateRegistrationWindowFees(
    clubId,
    windowId,
  );

  const before =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });

  expect(before.effectiveFeeVersionId).not.toBeNull();

  const feeBefore =
    await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
      where: {
        id: before.effectiveFeeVersionId!,
      },
    });

  // Extend the closing time by one hour.
  const extendedClosing = new Date(
    before.closesAt.getTime() + 60 * 60 * 1000,
  );

  const result = await service.extendRegistrationWindow(
    clubId,
    windowId,
    extendedClosing.toISOString(),
  );

  // The same registration window must be updated.
  expect(result.id).toBe(windowId);

  // The original opening timestamp must remain unchanged.
  expect(result.opensAt.toISOString()).toBe(
    before.opensAt.toISOString(),
  );

  // Only the closing timestamp changes.
  expect(result.closesAt.toISOString()).toBe(
    extendedClosing.toISOString(),
  );

  // The effective fee version must remain unchanged.
  expect(result.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );

  // The historical fee amounts must remain unchanged.
  const feeAfter =
    await prisma.clubMembershipFeeVersion.findUniqueOrThrow({
      where: {
        id: before.effectiveFeeVersionId!,
      },
    });

  expect(feeAfter.firstTimeFee.toFixed(2)).toBe(
    feeBefore.firstTimeFee.toFixed(2),
  );

  expect(feeAfter.renewalFee.toFixed(2)).toBe(
    feeBefore.renewalFee.toFixed(2),
  );

  expect(feeAfter.effectiveAt.toISOString()).toBe(
    feeBefore.effectiveAt.toISOString(),
  );

  // Registration must remain available.
  const availability =
    await service.getMembershipAvailability(clubId);

  expect(availability.status).toBe('OPEN');
  expect(availability.registrationAvailable).toBe(true);
  expect(availability.window?.id).toBe(windowId);

  expect(availability.window?.closesAt.toISOString()).toBe(
    extendedClosing.toISOString(),
  );
});
it('rejects extending a registration window that has not opened', async () => {
  const club = await service.create(dto('extend-future'));

  const window = await prisma.clubRegistrationWindow.findFirstOrThrow({
    where: { clubId: club.id },
  });

  const newClosing = new Date(
    window.closesAt.getTime() + 60 * 60 * 1000,
  );

  await expect(
    service.extendRegistrationWindow(
      club.id,
      window.id,
      newClosing.toISOString(),
    ),
  ).rejects.toThrow(ConflictException);

  const preserved = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: window.id },
  });

  expect(preserved.closesAt.toISOString()).toBe(
    window.closesAt.toISOString(),
  );
});
it('rejects extending an early-closed registration window', async () => {
  const { clubId, windowId } =
    await createActiveWindow('extend-closed');

  await service.activateRegistrationWindowFees(
    clubId,
    windowId,
  );

  await service.closeRegistrationWindow(
    clubId,
    windowId,
  );

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(before.closedAt).not.toBeNull();

  const newClosing = new Date(
    before.closesAt.getTime() + 60 * 60 * 1000,
  );

  await expect(
    service.extendRegistrationWindow(
      clubId,
      windowId,
      newClosing.toISOString(),
    ),
  ).rejects.toThrow(ConflictException);

  const after = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(after.closesAt.toISOString()).toBe(
    before.closesAt.toISOString(),
  );

  expect(after.closedAt?.toISOString()).toBe(
    before.closedAt?.toISOString(),
  );

  expect(after.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );
});
it('rejects shortening an active registration window', async () => {
  const { clubId, windowId } =
    await createActiveWindow('extend-shortening');

  await service.activateRegistrationWindowFees(
    clubId,
    windowId,
  );

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  const shorterClosing = new Date(
    before.closesAt.getTime() - 60 * 1000,
  );

  await expect(
    service.extendRegistrationWindow(
      clubId,
      windowId,
      shorterClosing.toISOString(),
    ),
  ).rejects.toThrow();

  const after = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(after.closesAt.toISOString()).toBe(
    before.closesAt.toISOString(),
  );

  expect(after.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );
});
it('rejects extending registration for an archived club', async () => {
  const { clubId, windowId } =
    await createActiveWindow('extend-archived');

  await service.activateRegistrationWindowFees(
    clubId,
    windowId,
  );

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  await service.archive(clubId);

  const newClosing = new Date(
    before.closesAt.getTime() + 60 * 60 * 1000,
  );

  await expect(
    service.extendRegistrationWindow(
      clubId,
      windowId,
      newClosing.toISOString(),
    ),
  ).rejects.toThrow(ConflictException);

  const after = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(after.closesAt.toISOString()).toBe(
    before.closesAt.toISOString(),
  );

  expect(after.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );
});
it('rejects extending a naturally expired registration window', async () => {
  const club = await service.create(dto('extend-expired'));

  const scheduled = await prisma.clubRegistrationWindow.findFirstOrThrow({
    where: { clubId: club.id },
  });

  // Move the still-future fixture into the past.
  // The fixture is modified before its original opening time.
  const opensAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const closesAt = new Date(Date.now() - 60 * 60 * 1000);

  await prisma.clubRegistrationWindow.update({
    where: { id: scheduled.id },
    data: { opensAt, closesAt },
  });

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: scheduled.id },
  });

  const proposedClosing = new Date(
    Date.now() + 60 * 60 * 1000,
  );

  await expect(
    service.extendRegistrationWindow(
      club.id,
      scheduled.id,
      proposedClosing.toISOString(),
    ),
  ).rejects.toThrow(ConflictException);

  const after = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: scheduled.id },
  });

  expect(after.opensAt.toISOString()).toBe(
    before.opensAt.toISOString(),
  );

  expect(after.closesAt.toISOString()).toBe(
    before.closesAt.toISOString(),
  );

  expect(after.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );
});
it('rejects an active-window extension that overlaps a scheduled window', async () => {
  const { clubId, windowId } =
    await createActiveWindow('extend-overlap');

  await service.activateRegistrationWindowFees(
    clubId,
    windowId,
  );

  const before = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  // Schedule another window after the current window closes.
  const futureOpensAt = new Date(
    before.closesAt.getTime() + 30 * 60 * 1000,
  );

  const futureClosesAt = new Date(
    futureOpensAt.getTime() + 60 * 60 * 1000,
  );

  const nextWindow = await service.createRegistrationWindow(
    clubId,
    {
      opensAt: futureOpensAt.toISOString(),
      closesAt: futureClosesAt.toISOString(),
    },
  );

  // Attempt to extend the current window into the next one.
  const overlappingClosing = new Date(
    futureOpensAt.getTime() + 30 * 60 * 1000,
  );

  await expect(
    service.extendRegistrationWindow(
      clubId,
      windowId,
      overlappingClosing.toISOString(),
    ),
  ).rejects.toThrow(ConflictException);

  // The existing active window must remain unchanged.
  const preserved = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: windowId },
  });

  expect(preserved.closesAt.toISOString()).toBe(
    before.closesAt.toISOString(),
  );

  expect(preserved.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );

  // The future registration window must also remain unchanged.
  const preservedNext = await prisma.clubRegistrationWindow.findUniqueOrThrow({
    where: { id: nextWindow.id },
  });

  expect(preservedNext.opensAt.toISOString()).toBe(
    futureOpensAt.toISOString(),
  );

  expect(preservedNext.closesAt.toISOString()).toBe(
    futureClosesAt.toISOString(),
  );
});
it('cancels one scheduled window without affecting another window or registration mode', async () => {
  const club = await service.create(
    dto('cancel-one-scheduled-window'),
  );

  // The test helper creates an initial future window.
  const firstWindow =
    await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: club.id },
    });

  expect(firstWindow.canceledAt).toBeNull();
  expect(firstWindow.effectiveFeeVersionId).toBeNull();

  // Create another non-overlapping future window.
  const secondWindow =
    await service.createRegistrationWindow(club.id, {
      opensAt: '2099-03-01T00:00:00.000Z',
      closesAt: '2099-04-01T00:00:00.000Z',
    });

  // Cancel ONLY the second window.
  const canceled =
    await service.cancelScheduledRegistrationWindow(
      club.id,
      secondWindow.id,
    );

  expect(canceled.id).toBe(secondWindow.id);
  expect(canceled.canceledAt).not.toBeNull();
  expect(canceled.effectiveFeeVersionId).toBeNull();

  // Verify cancellation was persisted.
  const savedCanceled =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: secondWindow.id },
    });

  expect(savedCanceled.canceledAt).not.toBeNull();
  expect(savedCanceled.effectiveFeeVersionId).toBeNull();

  // The first window must remain scheduled and unchanged.
  const preservedFirst =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: firstWindow.id },
    });

  expect(preservedFirst.canceledAt).toBeNull();
  expect(preservedFirst.closedAt).toBeNull();
  expect(preservedFirst.effectiveFeeVersionId).toBeNull();

  expect(preservedFirst.opensAt.toISOString()).toBe(
    firstWindow.opensAt.toISOString(),
  );

  expect(preservedFirst.closesAt.toISOString()).toBe(
    firstWindow.closesAt.toISOString(),
  );

  // The club must remain in WINDOWED registration mode.
  const settings =
    await prisma.clubMembershipSettings.findUniqueOrThrow({
      where: { clubId: club.id },
    });

  expect(settings.registrationMode).toBe('WINDOWED');

  // A replacement window may use the canceled window's dates.
  const replacement =
    await service.createRegistrationWindow(club.id, {
      opensAt: secondWindow.opensAt.toISOString(),
      closesAt: secondWindow.closesAt.toISOString(),
    });

  expect(replacement.id).not.toBe(secondWindow.id);
  expect(replacement.canceledAt).toBeNull();
  expect(replacement.effectiveFeeVersionId).toBeNull();

  // The canceled window must still exist as history.
  expect(
    await prisma.clubRegistrationWindow.findUnique({
      where: { id: secondWindow.id },
    }),
  ).not.toBeNull();

  // Both usable windows should remain scheduled.
  const availability =
    await service.getMembershipAvailability(club.id);

  expect(availability.status).toBe('SCHEDULED');
  expect(availability.window?.id).toBe(firstWindow.id);
});
it('rejects canceling an active registration window', async () => {
  const { clubId, windowId } =
    await createActiveWindow('cancel-active');

  await service.activateRegistrationWindowFees(
    clubId,
    windowId,
  );

  const before =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });

  await expect(
    service.cancelScheduledRegistrationWindow(
      clubId,
      windowId,
    ),
  ).rejects.toThrow(ConflictException);

  const after =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });

  expect(after.canceledAt).toBeNull();
  expect(after.closedAt).toBeNull();
  expect(after.effectiveFeeVersionId).toBe(
    before.effectiveFeeVersionId,
  );
});
it('rejects canceling an expired registration window', async () => {
  const club = await service.create(
    dto('cancel-expired'),
  );

  const scheduled =
    await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: club.id },
    });

  // Move the still-future fixture into the past.
  const opensAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const closesAt = new Date(Date.now() - 60 * 60 * 1000);

  await prisma.clubRegistrationWindow.update({
    where: { id: scheduled.id },
    data: { opensAt, closesAt },
  });

  await expect(
    service.cancelScheduledRegistrationWindow(
      club.id,
      scheduled.id,
    ),
  ).rejects.toThrow(ConflictException);

  const after =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: scheduled.id },
    });

  expect(after.canceledAt).toBeNull();
  expect(after.opensAt.toISOString()).toBe(opensAt.toISOString());
  expect(after.closesAt.toISOString()).toBe(closesAt.toISOString());
});
it('rejects canceling an already canceled registration window', async () => {
  const club = await service.create(
    dto('cancel-twice'),
  );

  const scheduled =
    await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: club.id },
    });

  const first =
    await service.cancelScheduledRegistrationWindow(
      club.id,
      scheduled.id,
    );

  expect(first.canceledAt).not.toBeNull();

  await expect(
    service.cancelScheduledRegistrationWindow(
      club.id,
      scheduled.id,
    ),
  ).rejects.toThrow(ConflictException);

  const after =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: scheduled.id },
    });

  expect(after.canceledAt?.toISOString()).toBe(
    first.canceledAt?.toISOString(),
  );
});
it('rejects canceling a scheduled window for an archived club', async () => {
  const club = await service.create(
    dto('cancel-archived'),
  );

  const scheduled =
    await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: club.id },
    });

  await service.archive(club.id);

  await expect(
    service.cancelScheduledRegistrationWindow(
      club.id,
      scheduled.id,
    ),
  ).rejects.toThrow(ConflictException);

  const after =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: scheduled.id },
    });

  expect(after.canceledAt).toBeNull();
});
it('rejects cancellation when a scheduled window becomes active during a competing transaction', async () => {
  const club = await service.create(
    dto('cancel-opening-race'),
  );

  const scheduled =
    await prisma.clubRegistrationWindow.findFirstOrThrow({
      where: { clubId: club.id },
    });

  expect(scheduled.opensAt.getTime()).toBeGreaterThan(Date.now());

  let cancellation: Promise<void> | undefined;

  // Hold the same membership-settings lock used by cancellation.
  // While it is held, move the scheduled window into its active interval.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "ClubMembershipSettings"
      WHERE "clubId" = ${club.id}::uuid
      FOR UPDATE
    `;

    // Begin cancellation while another transaction owns the lock.
    cancellation = expect(
      service.cancelScheduledRegistrationWindow(
        club.id,
        scheduled.id,
      ),
    ).rejects.toThrow(ConflictException);

    // Simulate the window opening before cancellation obtains its lock.
    const opensAt = new Date(Date.now() - 60_000);
    const closesAt = new Date(Date.now() + 60 * 60_000);

    await tx.clubRegistrationWindow.update({
      where: { id: scheduled.id },
      data: { opensAt, closesAt },
    });
  });

  if (!cancellation) {
    throw new Error('Cancellation was not started.');
  }

  await cancellation;

  const preserved =
    await prisma.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: scheduled.id },
    });

  expect(preserved.canceledAt).toBeNull();
  expect(preserved.opensAt.getTime()).toBeLessThanOrEqual(Date.now());
  expect(preserved.closesAt.getTime()).toBeGreaterThan(Date.now());

  // The window must remain eligible for normal fee activation.
  const activated = await service.activateRegistrationWindowFees(
    club.id,
    scheduled.id,
  );

  expect(activated.effectiveFeeVersionId).not.toBeNull();

  const availability = await service.getMembershipAvailability(
    club.id,
  );

  expect(availability.status).toBe('OPEN');
  expect(availability.registrationAvailable).toBe(true);
});

});
