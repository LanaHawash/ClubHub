import { NotFoundException } from '@nestjs/common';
import { ClubEligibilityService } from './club-eligibility.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('ClubEligibilityService', () => {
  const account = {
    universityStudent: {
      majorId: 'computer-engineering',
      major: { facultyId: 'engineering' },
    },
  };
  const baseClub = {
    status: 'ACTIVE',
    classification: 'GENERAL',
    facultyId: null,
    eligibleMajors: [],
  };
  const prisma = {
    account: { findUnique: jest.fn() },
    club: { findUnique: jest.fn() },
  };
  let service: ClubEligibilityService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.account.findUnique.mockResolvedValue(account);
    prisma.club.findUnique.mockResolvedValue(baseClub);
    service = new ClubEligibilityService(prisma as unknown as PrismaService);
  });

  it('allows any university student into a general club', async () => {
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({
      eligible: true, reason: 'ELIGIBLE',
    });
  });

  it('allows a faculty match', async () => {
    prisma.club.findUnique.mockResolvedValue({ ...baseClub, classification: 'FACULTY_BASED', facultyId: 'engineering' });
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({ eligible: true, reason: 'ELIGIBLE' });
  });

  it('rejects a faculty mismatch', async () => {
    prisma.club.findUnique.mockResolvedValue({ ...baseClub, classification: 'FACULTY_BASED', facultyId: 'pharmacy' });
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({ eligible: false, reason: 'FACULTY_NOT_ALLOWED' });
  });

  it('allows an explicitly selected major among multiple majors', async () => {
    prisma.club.findUnique.mockResolvedValue({ ...baseClub, classification: 'MAJOR_BASED', eligibleMajors: [{ majorId: 'electrical' }, { majorId: 'computer-engineering' }] });
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({ eligible: true, reason: 'ELIGIBLE' });
  });

  it('rejects a major not in the selection', async () => {
    prisma.club.findUnique.mockResolvedValue({ ...baseClub, classification: 'MAJOR_BASED', eligibleMajors: [{ majorId: 'nursing' }] });
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({ eligible: false, reason: 'MAJOR_NOT_ALLOWED' });
  });

  it('fails closed on invalid club configuration', async () => {
    prisma.club.findUnique.mockResolvedValue({ ...baseClub, classification: 'MAJOR_BASED' });
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({ eligible: false, reason: 'INVALID_CLUB_CONFIGURATION' });
  });

  it('does not allow joining an archived club', async () => {
    prisma.club.findUnique.mockResolvedValue({ ...baseClub, status: 'ARCHIVED' });
    await expect(service.evaluateForAccount('account', 'club')).resolves.toEqual({ eligible: false, reason: 'CLUB_ARCHIVED' });
  });

  it('returns 404 for an unknown club', async () => {
    prisma.club.findUnique.mockResolvedValue(null);
    await expect(service.evaluateForAccount('account', 'club')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 if the account has no student profile', async () => {
    prisma.account.findUnique.mockResolvedValue({ universityStudent: null });
    await expect(service.evaluateForAccount('account', 'club')).rejects.toThrow(NotFoundException);
  });

  it('looks up the student through the authenticated account ID', async () => {
    await service.evaluateForAccount('account-id', 'club-id');
    expect(prisma.account.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'account-id' } }));
    expect(prisma.club.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'club-id' } }));
  });
});
