import { jest } from '@jest/globals';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('Sprint 5.E — personalized membership quote reuses 5.D availability', () => {
  const now = new Date();
  const availability = {
    clubId: 'club', registrationMode: 'ALWAYS_OPEN' as const,
    checkedAt: now, status: 'ALWAYS_OPEN' as const,
    registrationAvailable: true,
    effectiveFees: {
      firstTimeFee: '30.00', renewalFee: '20.00', currency: 'ILS',
      feeVersionId: 'version', effectiveAt: now,
    },
    window: null,
  };
  const prisma = {
    account: { findUnique: jest.fn<() => Promise<unknown>>() },
    membership: { findFirst: jest.fn<() => Promise<unknown>>() },
  };
  const service = new ClubsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.account.findUnique.mockResolvedValue({ universityStudentId: 'student' });
    jest.spyOn(service, 'getMembershipAvailability').mockResolvedValue(availability);
  });

  it('quotes the first-time fee with no confirmed history', async () => {
    prisma.membership.findFirst.mockResolvedValue(null);
    const quote = await service.getMembershipQuoteForAccount('account', 'club', true);
    expect(quote).toEqual(expect.objectContaining({ feeType: 'FIRST_TIME', amount: '30.00', canApply: true }));
  });

  it('quotes the renewal fee for an expired historical membership', async () => {
    prisma.membership.findFirst
      .mockResolvedValueOnce({ id: 'past' })
      .mockResolvedValueOnce(null);
    const quote = await service.getMembershipQuoteForAccount('account', 'club', true);
    expect(quote).toEqual(expect.objectContaining({ feeType: 'RENEWAL', amount: '20.00', canApply: true }));
  });

  it('blocks another application for an active member (no early renewal)', async () => {
    prisma.membership.findFirst
      .mockResolvedValueOnce({ id: 'past' })
      .mockResolvedValueOnce({ id: 'active', expiresAt: new Date(Date.now() + 86400000) });
    const quote = await service.getMembershipQuoteForAccount('account', 'club', true);
    expect(quote).toEqual(expect.objectContaining({ feeType: null, amount: null, canApply: false, alreadyActiveMember: true }));
  });

  it('does not quote an academically ineligible student', async () => {
    prisma.membership.findFirst.mockResolvedValue(null);
    const quote = await service.getMembershipQuoteForAccount('account', 'club', false);
    expect(quote).toEqual(expect.objectContaining({ feeType: null, amount: null, canApply: false }));
  });
});
