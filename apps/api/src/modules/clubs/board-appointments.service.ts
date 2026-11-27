import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, AccountStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ClubEligibilityService } from './club-eligibility.service';
import { CreateBoardAppointmentDto } from './dto/create-board-appointment.dto';
import { UpdateBoardAppointmentDto } from './dto/update-board-appointment.dto';
import {
  ForbiddenException,
} from '@nestjs/common';

import {
  validateNewBoardTerm,
  resolveBoardCoveragePeriod,
  getLocalBoardDate,
} from '../../shared/membership/board-term';

import {
  evaluateBoardMembershipCoverage,
} from '../../shared/membership/board-membership-coverage';

import {
  planBoardMembershipPurchase,
} from '../../shared/membership/board-membership-plan';

import {
  createBoardMembershipFeeSnapshot,
} from '../../shared/membership/board-membership-fee';

import {
  assertNoBoardAppointmentConflict,
} from '../../shared/membership/board-appointment-conflicts';

import {
  calculateNominationDeadline,
} from '../../shared/membership/membership-time';

import {
  lockMembershipClub,
  lockMembershipSettings,
  lockStudentClubMembership,
  getMembershipTransactionTime,
} from '../../shared/membership/membership-lock';
import {
  reconcileStudentClubApplications,
} from '../../shared/membership/membership-lifecycle';
import {
  validateUpdatedBoardTerm,
} from '../../shared/membership/board-term-update';

import {
  parseBoardDate,
} from '../../shared/membership/board-term';

@Injectable()
export class BoardAppointmentsService {
  constructor(private readonly prisma: PrismaService, private readonly eligibility: ClubEligibilityService) {}

  private parseDay(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Date must use YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid calendar date.');
    return date;
  }
  private today(): Date {
  return getLocalBoardDate(
    new Date(),
  );
}
  private async assertClub(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true, status: true } });
    if (!club) throw new NotFoundException('Club not found.');
    if (club.status !== 'ACTIVE') throw new ConflictException('Club is archived.');
  }
  private async activeStudentAccount(studentId: string) {
    const student = await this.prisma.universityStudent.findUnique({
      where: { id: studentId },
      select: { id: true, account: { select: { id: true, role: true, status: true } } },
    });
    if (!student?.account || student.account.role !== AccountRole.STUDENT || student.account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Board members must have an active ClubHub student account.');
    }
    return student.account.id;
  }
  private async assertEligible(accountId: string, clubId: string) {
    const outcome = await this.eligibility.evaluateForAccount(accountId, clubId);
    if (!outcome.eligible) throw new BadRequestException(`Student is not eligible for this club: ${outcome.reason}`);
  }
  private readonly projection = {
    id: true, clubId: true, studentId: true, position: true, startDate: true, endDate: true, endedAt: true,
    student: { select: { universityId: true, fullName: true, email: true,
      account: { select: { profilePhotoUrl: true } },
      major: { select: { name: true, faculty: { select: { name: true } } } },
    } },
  } as const;

  async current(clubId: string) {
    await this.assertClub(clubId);
    const today = this.today();
    return this.prisma.boardAppointment.findMany({
      where: { clubId, endedAt: null, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
      select: this.projection, orderBy: [{ startDate: 'desc' }, { position: 'asc' }],
    });
  }
  async history(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found.');
    return this.prisma.boardAppointment.findMany({ where: { clubId }, select: this.projection, orderBy: [{ startDate: 'desc' }, { id: 'asc' }] });
  }
  async create(
    clubId: string,
    dto: CreateBoardAppointmentDto,
    nominatedById: string,
  ) {
    /*
    * Authorize before performing lifecycle reconciliation.
    */
    const actor =
      await this.prisma.account.findUnique({
        where: {
          id: nominatedById,
        },

        select: {
          role: true,
          status: true,
        },
      });

    if (
      !actor ||
      actor.role !== 'DEANSHIP' ||
      actor.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'Only active Deanship accounts can create board appointments.',
      );
    }

    /*
    * Persist any already-expired applications before
    * attempting to reserve a new nomination.
    */
    await reconcileStudentClubApplications(
      this.prisma,
      dto.studentId,
      clubId,
    );

    return this.prisma.$transaction(async (tx) => {
    await lockMembershipClub(
      tx,
      clubId,
    );

    const club =
      await tx.club.findUnique({
        where: {
          id: clubId,
        },

        select: {
          id: true,
          status: true,
        },
      });

    if (!club) {
      throw new NotFoundException(
        'Club not found.',
      );
    }

    if (club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Board appointments cannot be created for an archived club.',
      );
    }

    /*
     * Verify the authenticated Deanship actor.
     */
    const actor =
      await tx.account.findUnique({
        where: {
          id: nominatedById,
        },

        select: {
          role: true,
          status: true,
        },
      });

    if (
      !actor ||

      actor.role !== 'DEANSHIP' ||

      actor.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'Only active Deanship accounts can create board appointments.',
      );
    }

    /*
     * Lock existing membership settings, if present.
     *
     * Direct appointments do not require fee
     * configuration, while paid nominations do.
     */
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    await lockStudentClubMembership(
      tx,
      clubId,
      dto.studentId,
    );

    const now =
      await getMembershipTransactionTime(tx);

    const term =
      validateNewBoardTerm(
        dto.startDate,
        dto.endDate,
        now,
      );

    const position =
      dto.position.trim();

    if (
      position.length < 2 ||
      position.length > 100
    ) {
      throw new BadRequestException(
        'Invalid board position.',
      );
    }

    const student =
      await tx.universityStudent.findUnique({
        where: {
          id: dto.studentId,
        },

        select: {
          id: true,

          account: {
            select: {
              id: true,
              role: true,
              status: true,
            },
          },
        },
      });

    if (
      !student?.account ||

      student.account.role !== 'STUDENT' ||

      student.account.status !== 'ACTIVE'
    ) {
      throw new BadRequestException(
        'Board members must have an active ClubHub student account.',
      );
    }

    const eligibility =
      await this.eligibility.evaluateForAccount(
        student.account.id,
        clubId,
        tx,
      );

    if (!eligibility.eligible) {
      throw new BadRequestException(
        `Student is not eligible for this club: ${eligibility.reason}`,
      );
    }

    await assertNoBoardAppointmentConflict(
      tx,
      {
        clubId,

        studentId:
          dto.studentId,

        position,

        startDate:
          term.startDate,

        endDate:
          term.endDate,

        now,
      },
    );

    const period =
      await resolveBoardCoveragePeriod(
        tx,
        term,
        now,
      );

    const coverage =
      await evaluateBoardMembershipCoverage(
        tx,
        clubId,
        dto.studentId,
        period,
      );

    /*
     * ROUTE A:
     * Existing membership covers the entire term.
     */
    if (coverage.fullyCovered) {
      const appointment =
        await tx.boardAppointment.create({
          data: {
            clubId,

            studentId:
              dto.studentId,

            position,

            startDate:
              term.startDate,

            endDate:
              term.endDate,
          },

          select:
            this.projection,
        });

      return {
        outcome:
          'DIRECT_APPOINTMENT' as const,

        appointment,

        nomination: null,

        application: null,

        coverage,
      };
    }

    /*
     * ROUTE B:
     * Insufficient membership coverage.
     */

    const liveApplication =
      await tx.membershipApplication.findFirst({
        where: {
          clubId,

          studentId:
            dto.studentId,

          status: {
            in: [
              'PENDING_PAYMENT',
              'PAYMENT_PROCESSING',
            ],
          },
        },

        select: {
          id: true,
          kind: true,
          status: true,
        },
      });

    if (liveApplication) {
      throw new ConflictException({
        code: 'BOARD_CANDIDATE_HAS_LIVE_APPLICATION',

        message:
          'The candidate already has a live membership application. Resolve it before creating a board nomination.',

        applicationId:
          liveApplication.id,
      });
    }

    const existingNomination =
      await tx.boardNomination.findFirst({
        where: {
          clubId,

          studentId:
            dto.studentId,

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

    if (existingNomination) {
      throw new ConflictException({
        code: 'BOARD_NOMINATION_ALREADY_PENDING',

        message:
          'The candidate already has a pending board nomination.',

        nominationId:
          existingNomination.id,
      });
    }

    const membershipPlan =
      await planBoardMembershipPurchase(
        tx,
        clubId,
        dto.studentId,
        period,
        now,
      );

    const fee =
      await createBoardMembershipFeeSnapshot(
        tx,
        clubId,
        nominatedById,
        membershipPlan.feeType,
        now,
      );

    const deadlineAt =
      calculateNominationDeadline(
        now,
      );

    const nomination =
      await tx.boardNomination.create({
        data: {
          clubId,

          studentId:
            dto.studentId,

          position,

          proposedStartDate:
            term.startDate,

          proposedEndDate:
            term.endDate,

          nominatedById,

          nominatedAt:
            now,

          deadlineAt,

          status:
            'PENDING_PAYMENT',

          reason:
            coverage.reason === 'NO_MEMBERSHIP'
              ? 'NO_MEMBERSHIP'
              : 'INSUFFICIENT_COVERAGE',
        },
      });

    const application =
      await tx.membershipApplication.create({
        data: {
          clubId,

          studentId:
            dto.studentId,

          kind:
            'BOARD_ONBOARDING',

          status:
            'PENDING_PAYMENT',

          boardNominationId:
            nomination.id,

          feeType:
            fee.feeType,

          quotedAmount:
            fee.quotedAmount,

          currency:
            fee.currency,

          feeVersionId:
            fee.feeVersionId,

          registrationWindowId:
            null,

          registrationModeAtSubmission:
            null,

          submittedAt:
            now,

          originalDeadlineAt:
            deadlineAt,

          paymentDeadlineAt:
            deadlineAt,
        },
      });

    return {
      outcome:
        'NOMINATION_CREATED' as const,

      appointment: null,

      nomination,

      application: {
        ...application,

        quotedAmount:
          application.quotedAmount.toFixed(2),
      },

      coverage,

      membershipPlan,
    };
  });
}
async update(
  id: string,

  dto: UpdateBoardAppointmentDto,
) {
  const initial =
    await this.prisma.boardAppointment.findUnique({
      where: {
        id,
      },

      select: {
        clubId: true,
      },
    });

  if (!initial) {
    throw new NotFoundException(
      'Appointment not found.',
    );
  }

  return this.prisma.$transaction(async tx => {
    await lockMembershipClub(
      tx,

      initial.clubId,
    );

    /*
     * Reread after acquiring the club lock.
     * Never validate against a stale appointment.
     */
    const old =
      await tx.boardAppointment.findUniqueOrThrow({
        where: {
          id,
        },
      });

    const club =
      await tx.club.findUnique({
        where: {
          id: old.clubId,
        },

        select: {
          status: true,
        },
      });

    if (!club || club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Board appointments cannot be modified for an archived club.',
      );
    }

    if (old.endedAt) {
      throw new ConflictException(
        'A manually ended appointment cannot be edited.',
      );
    }

    await lockStudentClubMembership(
      tx,

      old.clubId,

      old.studentId,
    );

    const now =
      await getMembershipTransactionTime(tx);

    const today =
      getLocalBoardDate(now);

    if (
      old.endDate &&
      old.endDate < today
    ) {
      throw new ConflictException(
        'An expired board appointment cannot be edited.',
      );
    }

    const position =
      dto.position === undefined
        ? old.position
        : dto.position.trim();

    if (
      position.length < 2 ||
      position.length > 100
    ) {
      throw new BadRequestException(
        'Invalid board position.',
      );
    }

    const startDate =
      dto.startDate !== undefined
        ? parseBoardDate(dto.startDate)
        : old.startDate;

    const endDate =
      dto.endDate !== undefined
        ? parseBoardDate(dto.endDate)
        : old.endDate;

    const startChanged =
      startDate.getTime() !==
      old.startDate.getTime();

    const endChanged =
      (endDate?.getTime() ?? null) !==
      (old.endDate?.getTime() ?? null);

    const positionChanged =
      position !== old.position;

    if (
      !startChanged &&
      !endChanged &&
      !positionChanged
    ) {
      return tx.boardAppointment.findUniqueOrThrow({
        where: {
          id,
        },

        select:
          this.projection,
      });
    }

    /*
     * Any actual term modification must satisfy
     * current board term rules.
     */
    if (startChanged || endChanged) {
      const term =
        validateUpdatedBoardTerm(
          old.startDate,

          startDate,

          endDate,

          now,
        );

      /*
       * A shortening of an existing term does not
       * introduce additional membership obligations.
       *
       * Preserve legacy appointments without forcing
       * retroactive membership purchases.
       */
      const shorteningOnly =
        !startChanged &&
        endChanged &&
        endDate !== null &&
        (
          old.endDate === null ||
          endDate < old.endDate
        );

      if (!shorteningOnly) {
        const period =
          await resolveBoardCoveragePeriod(
            tx,

            term,

            now,
          );

        const coverage =
          await evaluateBoardMembershipCoverage(
            tx,

            old.clubId,

            old.studentId,

            period,
          );

        if (!coverage.fullyCovered) {
          throw new ConflictException({
            code:
              'BOARD_MEMBERSHIP_COVERAGE_REQUIRED',

            message:
              'Paid membership must cover the complete remaining board term before it can be extended or rescheduled.',

            missingIntervals:
              coverage.missingIntervals,
          });
        }
      }
    }

    /*
     * A legacy appointment without an end date
     * remains indefinite unless its term is edited.
     *
     * Use a distant comparison boundary solely
     * for overlap detection.
     */
    const conflictEndDate =
      endDate ??
      new Date(
        '9999-12-31T00:00:00.000Z',
      );

    await assertNoBoardAppointmentConflict(
      tx,

      {
        clubId:
          old.clubId,

        studentId:
          old.studentId,

        position,

        startDate,

        endDate:
          conflictEndDate,

        now,

        excludeAppointmentId:
          id,
      },
    );

    /*
     * Existing administrator assignments cannot
     * be moved outside their effective board term.
     */
    if (
      startDate > today ||
      (
        endDate &&
        endDate < today
      )
    ) {
      const active =
        await tx.clubAdminAssignment.count({
          where: {
            boardAppointmentId: id,

            revokedAt: null,
          },
        });

      if (active > 0) {
        throw new ConflictException(
          'Cannot move an administrator outside their board term. End the appointment first.',
        );
      }
    }

    return tx.boardAppointment.update({
      where: {
        id,
      },

      data: {
        position,

        startDate,

        endDate,
      },

      select:
        this.projection,
    });
  });
}
 async end(
  id: string,

  _dateValue: string,

  revokedById: string,
) {
  const initial =
    await this.prisma.boardAppointment.findUnique({
      where: {
        id,
      },

      select: {
        clubId: true,
      },
    });

  if (!initial) {
    throw new NotFoundException(
      'Appointment not found.',
    );
  }

  return this.prisma.$transaction(async tx => {
    await lockMembershipClub(
      tx,

      initial.clubId,
    );

    const old =
      await tx.boardAppointment.findUniqueOrThrow({
        where: {
          id,
        },
      });

    const club =
      await tx.club.findUnique({
        where: {
          id: old.clubId,
        },

        select: {
          status: true,
        },
      });

    if (!club || club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Board appointments cannot be ended for an archived club.',
      );
    }

    const actor =
      await tx.account.findUnique({
        where: {
          id: revokedById,
        },

        select: {
          role: true,

          status: true,
        },
      });

    if (
      !actor ||
      actor.role !== AccountRole.DEANSHIP ||
      actor.status !== AccountStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'Only active Deanship accounts can end board appointments.',
      );
    }

    const now =
      await getMembershipTransactionTime(tx);

    const today =
      getLocalBoardDate(now);

    if (
      old.endedAt ||
      old.startDate > today ||
      (
        old.endDate &&
        old.endDate < today
      )
    ) {
      throw new ConflictException(
        'Appointment already ended or not yet active.',
      );
    }

    /*
     * Immediately revoke administrator access
     * associated with the terminated appointment.
     */
    await tx.clubAdminAssignment.updateMany({
      where: {
        boardAppointmentId: id,

        revokedAt: null,
      },

      data: {
        revokedAt: now,

        revokedById,
      },
    });

    return tx.boardAppointment.update({
      where: {
        id,
      },

      data: {
        endedAt: now,
      },

      select:
        this.projection,
    });
  });
}
}
