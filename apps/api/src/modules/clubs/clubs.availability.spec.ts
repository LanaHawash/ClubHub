import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { ClubsService } from './clubs.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
describe('ClubsService - Membership Availability', () => {
  const clubId = 'test-club-id';
const txMock = {
  $queryRaw: jest.fn(),

  club: {
    findUnique: jest.fn(),
  },

  clubMembershipSettings: {
    findUnique: jest.fn(),
  },

  clubRegistrationWindow: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },

  clubMembershipFeeVersion: {
    create: jest.fn(),
  },
};

type TransactionCallback = (
  tx: typeof txMock,
) => Promise<unknown>;

const prismaMock = {
  club: {
    findUnique: jest.fn(),
  },
clubMembershipFeeVersion: {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
},
  $transaction: jest.fn<
    (callback: TransactionCallback) => Promise<unknown>
  >(),
};

  let service: ClubsService;

  const club = (
    registrationMode: 'ALWAYS_OPEN' | 'WINDOWED' | null,
    windows: Array<{
      id: string;
      opensAt: Date;
      closesAt: Date;
      closedAt: Date | null;
      effectiveFeeVersionId: string | null;
    }> = [],
    status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE',
  ) => ({
    id: clubId,
    status,
    membershipSettings: registrationMode
      ? { registrationMode }
      : null,
    registrationWindows: windows,
  });

  const makeWindow = (
    id: string,
    opensAt: Date,
    closesAt: Date,
    closedAt: Date | null = null,
  ) => ({
    id,
    opensAt,
    closesAt,
    closedAt,
    effectiveFeeVersionId: null,
  });
  function latestOpenState(window: {
  id: string;
  opensAt: Date;
  closesAt: Date;
  closedAt: Date | null;
  effectiveFeeVersionId: string | null;
}) {
  return {
    status: 'ACTIVE',
    membershipSettings: {
      registrationMode: 'WINDOWED',
    },
    registrationWindows: [window],
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  service = new ClubsService(
    prismaMock as unknown as PrismaService,
  );

  prismaMock.$transaction.mockImplementation(
    async (callback) => callback(txMock),
  );
prismaMock.clubMembershipFeeVersion.findFirst.mockResolvedValue({
  id: 'fee-version-1',
} as never);

prismaMock.clubMembershipFeeVersion.findUnique.mockResolvedValue({
  id: 'fee-version-1',
  firstTimeFee: new Prisma.Decimal('40.00'),
  renewalFee: new Prisma.Decimal('25.00'),
  currency: 'ILS',
  effectiveAt: new Date('2026-11-01T00:00:00.000Z'),
} as never);
  txMock.$queryRaw.mockResolvedValue(
    [{ id: 'locked-record' }] as never,
  );

  txMock.club.findUnique.mockResolvedValue({
    id: clubId,
    status: 'ACTIVE',
  } as never);

  txMock.clubMembershipSettings.findUnique.mockResolvedValue({
    clubId,
    registrationMode: 'WINDOWED',
    pendingFirstTimeFee: '40.00',
    pendingRenewalFee: '25.00',
    currency: 'ILS',
  } as never);

  txMock.clubMembershipFeeVersion.create.mockResolvedValue({
    id: 'fee-version-1',
  } as never);

  txMock.clubRegistrationWindow.updateMany.mockResolvedValue({
    count: 1,
  } as never);
});

  it('rejects an unknown club', async () => {
    prismaMock.club.findUnique.mockResolvedValue(
      null as never,
    );

    await expect(
      service.getMembershipAvailability(clubId),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects availability for archived clubs', async () => {
    prismaMock.club.findUnique.mockResolvedValue(
      club('ALWAYS_OPEN', [], 'ARCHIVED') as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('CLUB_ARCHIVED');
    expect(result.registrationAvailable).toBe(false);
  });

  it('returns NOT_CONFIGURED for legacy clubs', async () => {
    prismaMock.club.findUnique.mockResolvedValue(
      club(null) as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.registrationAvailable).toBe(false);
  });

  it('allows registration for always-open clubs', async () => {
  prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('ALWAYS_OPEN') as never,
  )
  .mockResolvedValueOnce({
    status: 'ACTIVE',
    membershipSettings: {
      registrationMode: 'ALWAYS_OPEN',
    },
  } as never);

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('ALWAYS_OPEN');
    expect(result.registrationAvailable).toBe(true);
    expect(result.window).toBeNull();
    expect(result.effectiveFees?.firstTimeFee).toBe('40.00');
expect(result.effectiveFees?.renewalFee).toBe('25.00');
  });

  it('returns NOT_SCHEDULED when there are no windows', async () => {
    prismaMock.club.findUnique.mockResolvedValue(
      club('WINDOWED') as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('NOT_SCHEDULED');
    expect(result.registrationAvailable).toBe(false);
  });

  it('returns SCHEDULED for future windows', async () => {
    const now = Date.now();

    const futureWindow = makeWindow(
      'future-window',
      new Date(now + 3_600_000),
      new Date(now + 7_200_000),
    );

    prismaMock.club.findUnique.mockResolvedValue(
      club('WINDOWED', [futureWindow]) as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('SCHEDULED');
    expect(result.registrationAvailable).toBe(false);
    expect(result.window?.id).toBe('future-window');
  });

 it('returns OPEN and activates an active window', async () => {
  const now = Date.now();

  const activeWindow = makeWindow(
    'active-window',
    new Date(now - 3_600_000),
    new Date(now + 3_600_000),
  );

 prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('WINDOWED', [activeWindow]) as never,
  )
  .mockResolvedValueOnce(
    latestOpenState({
      ...activeWindow,
      effectiveFeeVersionId: 'fee-version-1',
    }) as never,
  );

  txMock.clubRegistrationWindow.findFirst.mockResolvedValue(
    activeWindow as never,
  );

  txMock.clubRegistrationWindow.findUniqueOrThrow.mockResolvedValue({
    ...activeWindow,
    effectiveFeeVersionId: 'fee-version-1',
  } as never);

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('OPEN');
  expect(result.registrationAvailable).toBe(true);

  expect(result.window?.effectiveFeeVersionId).toBe(
    'fee-version-1',
  );

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).toHaveBeenCalledTimes(1);

  expect(
    txMock.clubRegistrationWindow.updateMany,
  ).toHaveBeenCalledWith({
    where: expect.objectContaining({
      id: 'active-window',
      clubId,
      effectiveFeeVersionId: null,
    }),
    data: {
      effectiveFeeVersionId: 'fee-version-1',
    },
  });
  expect(result.effectiveFees?.feeVersionId).toBe(
  'fee-version-1',
);
});

  it('returns CLOSED for expired windows', async () => {
    const now = Date.now();

    const expiredWindow = makeWindow(
      'expired-window',
      new Date(now - 7_200_000),
      new Date(now - 3_600_000),
    );

    prismaMock.club.findUnique.mockResolvedValue(
      club('WINDOWED', [expiredWindow]) as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('CLOSED');
    expect(result.registrationAvailable).toBe(false);
  });

  it('returns CLOSED_EARLY for early closure', async () => {
    const now = Date.now();

    const closedWindow = makeWindow(
      'closed-window',
      new Date(now - 3_600_000),
      new Date(now + 3_600_000),
      new Date(now - 60_000),
    );

    prismaMock.club.findUnique.mockResolvedValue(
      club('WINDOWED', [closedWindow]) as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('CLOSED_EARLY');
    expect(result.registrationAvailable).toBe(false);
  });

  it('prioritizes upcoming registration over past windows', async () => {
    const now = Date.now();

    const pastWindow = makeWindow(
      'past-window',
      new Date(now - 14_400_000),
      new Date(now - 10_800_000),
    );

    const futureWindow = makeWindow(
      'future-window',
      new Date(now + 3_600_000),
      new Date(now + 7_200_000),
    );

    prismaMock.club.findUnique.mockResolvedValue(
      club('WINDOWED', [
        pastWindow,
        futureWindow,
      ]) as never,
    );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('SCHEDULED');
    expect(result.window?.id).toBe('future-window');
  });

  it('prioritizes an active window over future windows', async () => {
    const now = Date.now();

    const activeWindow = makeWindow(
      'active-window',
      new Date(now - 3_600_000),
      new Date(now + 3_600_000),
    );
    txMock.clubRegistrationWindow.findFirst.mockResolvedValue(
  activeWindow as never,
);

txMock.clubRegistrationWindow.findUniqueOrThrow.mockResolvedValue({
  ...activeWindow,
  effectiveFeeVersionId: 'fee-version-1',
} as never);

    const futureWindow = makeWindow(
      'future-window',
      new Date(now + 7_200_000),
      new Date(now + 10_800_000),
    );

   prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('WINDOWED', [
      activeWindow,
      futureWindow,
    ]) as never,
  )
  .mockResolvedValueOnce(
    latestOpenState({
      ...activeWindow,
      effectiveFeeVersionId: 'fee-version-1',
    }) as never,
  );

    const result =
      await service.getMembershipAvailability(clubId);

    expect(result.status).toBe('OPEN');
    expect(result.window?.id).toBe('active-window');
  });
  it('does not create another fee version for an already locked window', async () => {
  const now = Date.now();

  const lockedWindow = {
    ...makeWindow(
      'locked-window',
      new Date(now - 3_600_000),
      new Date(now + 3_600_000),
    ),
    effectiveFeeVersionId: 'existing-version',
  };

prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('WINDOWED', [lockedWindow]) as never,
  )
  .mockResolvedValueOnce(
    latestOpenState(lockedWindow) as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('OPEN');

  expect(result.window?.effectiveFeeVersionId).toBe(
    'existing-version',
  );

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();
});

it('does not activate a future window', async () => {
  const now = Date.now();

  const futureWindow = makeWindow(
    'future-window',
    new Date(now + 3_600_000),
    new Date(now + 7_200_000),
  );

  prismaMock.club.findUnique.mockResolvedValue(
    club('WINDOWED', [futureWindow]) as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('SCHEDULED');

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();

  expect(
    prismaMock.$transaction,
  ).not.toHaveBeenCalled();
});

it('does not activate an expired window', async () => {
  const now = Date.now();

  const expiredWindow = makeWindow(
    'expired-window',
    new Date(now - 7_200_000),
    new Date(now - 3_600_000),
  );

  prismaMock.club.findUnique.mockResolvedValue(
    club('WINDOWED', [expiredWindow]) as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('CLOSED');

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();
});

it('does not activate an early-closed window', async () => {
  const now = Date.now();

  const closedWindow = makeWindow(
    'closed-window',
    new Date(now - 3_600_000),
    new Date(now + 3_600_000),
    new Date(now - 60_000),
  );

  prismaMock.club.findUnique.mockResolvedValue(
    club('WINDOWED', [closedWindow]) as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('CLOSED_EARLY');

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();
});

it('preserves the scheduled opening time as the fee effective time', async () => {
  const now = Date.now();

  const opensAt = new Date(now - 3_600_000);

  const activeWindow = makeWindow(
    'active-window',
    opensAt,
    new Date(now + 3_600_000),
  );

  prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('WINDOWED', [activeWindow]) as never,
  )
  .mockResolvedValueOnce(
    latestOpenState({
      ...activeWindow,
      effectiveFeeVersionId: 'fee-version-1',
    }) as never,
  );

  txMock.clubRegistrationWindow.findFirst.mockResolvedValue(
    activeWindow as never,
  );

  txMock.clubRegistrationWindow.findUniqueOrThrow.mockResolvedValue({
    ...activeWindow,
    effectiveFeeVersionId: 'fee-version-1',
  } as never);

  await service.getMembershipAvailability(clubId);

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).toHaveBeenCalledWith({
    data: expect.objectContaining({
      clubId,
      effectiveAt: opensAt,
      currency: 'ILS',
    }),
  });
});

it('does not create a fee version if the window is already locked inside the transaction', async () => {
  const now = Date.now();

  const activeWindow = makeWindow(
    'active-window',
    new Date(now - 3_600_000),
    new Date(now + 3_600_000),
  );

  prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('WINDOWED', [activeWindow]) as never,
  )
  .mockResolvedValueOnce(
    latestOpenState({
      ...activeWindow,
      effectiveFeeVersionId: 'previously-locked-version',
    }) as never,
  );

  txMock.clubRegistrationWindow.findFirst.mockResolvedValue({
    ...activeWindow,
    effectiveFeeVersionId: 'previously-locked-version',
  } as never);

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.window?.effectiveFeeVersionId).toBe(
    'previously-locked-version',
  );

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();
});
it('returns the latest effective fees for an always-open club', async () => {
  prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('ALWAYS_OPEN') as never,
  )
  .mockResolvedValueOnce({
    status: 'ACTIVE',
    membershipSettings: {
      registrationMode: 'ALWAYS_OPEN',
    },
  } as never);

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('ALWAYS_OPEN');
  expect(result.registrationAvailable).toBe(true);

  expect(result.effectiveFees).toEqual({
    firstTimeFee: '40.00',
    renewalFee: '25.00',
    currency: 'ILS',
    feeVersionId: 'fee-version-1',
    effectiveAt: new Date('2026-11-01T00:00:00.000Z'),
  });

  expect(
    prismaMock.clubMembershipFeeVersion.findFirst,
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        clubId,
        effectiveAt: {
          lte: expect.any(Date),
        },
      },
    }),
  );
});
it('returns the locked effective fees for an active window', async () => {
  const now = Date.now();

  const activeWindow = {
    ...makeWindow(
      'active-window',
      new Date(now - 3_600_000),
      new Date(now + 3_600_000),
    ),
    effectiveFeeVersionId: 'fee-version-1',
  };

prismaMock.club.findUnique
  .mockResolvedValueOnce(
    club('WINDOWED', [activeWindow]) as never,
  )
  .mockResolvedValueOnce(
    latestOpenState({
      ...activeWindow,
      effectiveFeeVersionId: 'fee-version-1',
    }) as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('OPEN');
  expect(result.registrationAvailable).toBe(true);

  expect(result.effectiveFees?.firstTimeFee).toBe('40.00');
  expect(result.effectiveFees?.renewalFee).toBe('25.00');
  expect(result.effectiveFees?.feeVersionId).toBe('fee-version-1');

  expect(
    prismaMock.clubMembershipFeeVersion.findFirst,
  ).not.toHaveBeenCalled();

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();
});
it('does not expose effective fees when registration is scheduled', async () => {
  const now = Date.now();

  const futureWindow = makeWindow(
    'future-window',
    new Date(now + 3_600_000),
    new Date(now + 7_200_000),
  );

  prismaMock.club.findUnique.mockResolvedValue(
    club('WINDOWED', [futureWindow]) as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('SCHEDULED');
  expect(result.registrationAvailable).toBe(false);
  expect(result.effectiveFees).toBeNull();

  expect(
    prismaMock.clubMembershipFeeVersion.findUnique,
  ).not.toHaveBeenCalled();
});
it('rejects an always-open club with no effective fee version', async () => {
  prismaMock.club.findUnique.mockResolvedValue(
    club('ALWAYS_OPEN') as never,
  );

  prismaMock.clubMembershipFeeVersion.findFirst.mockResolvedValue(
    null as never,
  );

  await expect(
    service.getMembershipAvailability(clubId),
  ).rejects.toThrow(
    'An effective membership fee version is missing for this club.',
  );
});
it('rechecks availability when registration closes during resolution', async () => {
  const now = Date.now();

  const activeWindow = makeWindow(
    'race-window',
    new Date(now - 60_000),
    new Date(now + 3_600_000),
  );

  const closedWindow = {
    ...activeWindow,
    closedAt: new Date(),
  };

  prismaMock.club.findUnique
    .mockResolvedValueOnce(
      club('WINDOWED', [activeWindow]) as never,
    )
    .mockResolvedValueOnce(
      club('WINDOWED', [closedWindow]) as never,
    );

  txMock.clubRegistrationWindow.findFirst.mockResolvedValue(
    closedWindow as never,
  );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('CLOSED_EARLY');
  expect(result.registrationAvailable).toBe(false);
  expect(result.effectiveFees).toBeNull();

  expect(prismaMock.club.findUnique).toHaveBeenCalledTimes(2);
});
it('rechecks availability when a club is archived during resolution', async () => {
  const now = Date.now();

  const activeWindow = makeWindow(
    'archive-race-window',
    new Date(now - 60_000),
    new Date(now + 3_600_000),
  );

  prismaMock.club.findUnique
    .mockResolvedValueOnce(
      club('WINDOWED', [activeWindow]) as never,
    )
    .mockResolvedValueOnce({
      ...club('WINDOWED', [activeWindow]),
      status: 'ARCHIVED',
    } as never);

  txMock.club.findUnique.mockResolvedValue({
    id: clubId,
    status: 'ARCHIVED',
  } as never);

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('CLUB_ARCHIVED');
  expect(result.registrationAvailable).toBe(false);
  expect(result.effectiveFees).toBeNull();

  expect(prismaMock.club.findUnique).toHaveBeenCalledTimes(2);
});
it('does not return OPEN from a stale locked-window snapshot', async () => {
  const now = Date.now();

  const lockedWindow = {
    ...makeWindow(
      'stale-window',
      new Date(now - 60_000),
      new Date(now + 3_600_000),
    ),
    effectiveFeeVersionId: 'fee-version-1',
  };

  const closedWindow = {
    ...lockedWindow,
    closedAt: new Date(),
  };

  prismaMock.club.findUnique
    .mockResolvedValueOnce(
      club('WINDOWED', [lockedWindow]) as never,
    )
    .mockResolvedValueOnce(
      latestOpenState(closedWindow) as never,
    )
    .mockResolvedValueOnce(
      club('WINDOWED', [closedWindow]) as never,
    );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('CLOSED_EARLY');
  expect(result.registrationAvailable).toBe(false);
  expect(result.effectiveFees).toBeNull();

  expect(
    txMock.clubMembershipFeeVersion.create,
  ).not.toHaveBeenCalled();

  expect(prismaMock.club.findUnique).toHaveBeenCalledTimes(3);
});
it('does not return ALWAYS_OPEN when a club is archived during fee resolution', async () => {
  prismaMock.club.findUnique
    // Initial availability read sees an active club.
    .mockResolvedValueOnce(
      club('ALWAYS_OPEN') as never,
    )
    // Final validation sees that Deanship archived the club.
    .mockResolvedValueOnce({
      status: 'ARCHIVED',
      membershipSettings: {
        registrationMode: 'ALWAYS_OPEN',
      },
    } as never)
    // Retry reads the archived club.
    .mockResolvedValueOnce(
      club('ALWAYS_OPEN', [], 'ARCHIVED') as never,
    );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('CLUB_ARCHIVED');
  expect(result.registrationAvailable).toBe(false);
  expect(result.effectiveFees).toBeNull();
  expect(result.window).toBeNull();

  expect(
    prismaMock.club.findUnique,
  ).toHaveBeenCalledTimes(3);

  expect(
    prismaMock.clubMembershipFeeVersion.findUnique,
  ).toHaveBeenCalledTimes(1);
});
it('rechecks availability when registration mode changes during resolution', async () => {
  prismaMock.club.findUnique
    // First read sees ALWAYS_OPEN.
    .mockResolvedValueOnce(
      club('ALWAYS_OPEN') as never,
    )
    // Final check discovers WINDOWED mode.
    .mockResolvedValueOnce({
      status: 'ACTIVE',
      membershipSettings: {
        registrationMode: 'WINDOWED',
      },
    } as never)
    // Retry resolves the new mode.
    .mockResolvedValueOnce(
      club('WINDOWED', []) as never,
    );

  const result =
    await service.getMembershipAvailability(clubId);

  expect(result.status).toBe('NOT_SCHEDULED');
  expect(result.registrationAvailable).toBe(false);
  expect(result.effectiveFees).toBeNull();

  expect(
    prismaMock.club.findUnique,
  ).toHaveBeenCalledTimes(3);
});
});