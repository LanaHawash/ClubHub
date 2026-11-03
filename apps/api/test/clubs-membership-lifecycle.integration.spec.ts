import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClubsService } from '../src/modules/clubs/clubs.service';
import { CreateClubDto } from '../src/modules/clubs/dto/create-club.dto';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { jest } from '@jest/globals';

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

});
