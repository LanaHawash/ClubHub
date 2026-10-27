import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

export type EligibilityReason =
  | 'ELIGIBLE'
  | 'FACULTY_NOT_ALLOWED'
  | 'MAJOR_NOT_ALLOWED'
  | 'INVALID_CLUB_CONFIGURATION'
  | 'CLUB_ARCHIVED';

export type EligibilityResult = {
  eligible: boolean;
  reason: EligibilityReason;
};

@Injectable()
export class ClubEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  // Called with the authenticated account ID, never an account ID from request input.
  async evaluateForAccount(accountId: string, clubId: string): Promise<EligibilityResult> {
    const [account, club] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: accountId },
        select: {
          universityStudent: {
            select: {
              majorId: true,
              major: { select: { facultyId: true } },
            },
          },
        },
      }),
      this.prisma.club.findUnique({
        where: { id: clubId },
        select: {
          status: true,
          classification: true,
          facultyId: true,
          eligibleMajors: { select: { majorId: true } },
        },
      }),
    ]);

    if (!club) throw new NotFoundException('Club not found');
    if (!account?.universityStudent) {
      throw new NotFoundException('Student profile not found');
    }
    if (club.status !== 'ACTIVE') {
      return { eligible: false, reason: 'CLUB_ARCHIVED' };
    }

    const student = account.universityStudent;
    switch (club.classification) {
      case 'GENERAL':
        if (club.facultyId || club.eligibleMajors.length > 0) {
          return { eligible: false, reason: 'INVALID_CLUB_CONFIGURATION' };
        }
        return { eligible: true, reason: 'ELIGIBLE' };
      case 'FACULTY_BASED':
        if (!club.facultyId || club.eligibleMajors.length > 0) {
          return { eligible: false, reason: 'INVALID_CLUB_CONFIGURATION' };
        }
        return student.major.facultyId === club.facultyId
          ? { eligible: true, reason: 'ELIGIBLE' }
          : { eligible: false, reason: 'FACULTY_NOT_ALLOWED' };
      case 'MAJOR_BASED':
        if (club.facultyId || club.eligibleMajors.length === 0) {
          return { eligible: false, reason: 'INVALID_CLUB_CONFIGURATION' };
        }
        return club.eligibleMajors.some((entry) => entry.majorId === student.majorId)
          ? { eligible: true, reason: 'ELIGIBLE' }
          : { eligible: false, reason: 'MAJOR_NOT_ALLOWED' };
      default:
        return { eligible: false, reason: 'INVALID_CLUB_CONFIGURATION' };
    }
  }
}
