import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateMembershipFeesDto } from './dto/update-membership-fees.dto';
import { InitializeMembershipDto } from './dto/initialize-membership.dto';
import {
  Prisma,
  AccountStatus,
  AccountRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import {
  RegistrationWindowDatesDto,
  UpdateMembershipModeDto,
} from './dto/manage-registration-window.dto';
import type {
  EffectiveMembershipFees,
  MembershipAvailabilityResult,
} from './membership-availability.types';
@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}
  private async validateSupervisor(
  supervisorId?: string | null,
): Promise<void> {
  if (!supervisorId) return;

  const supervisor = await this.prisma.supervisorProfile.findUnique({
    where: { id: supervisorId },
    include: {
      account: {
        select: {
          role: true,
          status: true,
        },
      },
    },
  });

  if (
    !supervisor ||
    supervisor.account.role !== AccountRole.SUPERVISOR ||
    supervisor.account.status !== AccountStatus.ACTIVE
  ) {
    throw new BadRequestException(
      'Only active supervisors can be assigned to clubs.',
    );
  }
}
private async resolveClubLabelIds(
  tx: Prisma.TransactionClient,
  labelIds: string[] = [],
  newLabels: string[] = [],
): Promise<string[]> {
  const resolvedIds = new Set(labelIds);

  // Verify that every selected existing label exists.
  if (resolvedIds.size > 0) {
    const existing = await tx.label.findMany({
      where: {
        id: { in: [...resolvedIds] },
      },
      select: { id: true },
    });

    if (existing.length !== resolvedIds.size) {
      throw new BadRequestException(
        'One or more selected labels do not exist.',
      );
    }
  }

  // Normalize new names, including repeated spaces.
  const normalizedNames = [
    ...new Map(
      newLabels.map((name) => {
        const normalized = name.trim().replace(/\s+/g, ' ');

        return [normalized.toLowerCase(), normalized] as const;
      }),
    ).values(),
  ];

  for (const name of normalizedNames) {
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException(
        'Label names must contain 2 to 80 characters.',
      );
    }

    // Reuse an existing label if the name already exists.
    const existingLabel = await tx.label.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (existingLabel) {
      resolvedIds.add(existingLabel.id);
      continue;
    }

    // Create new labels only inside the club transaction.
    const createdLabel = await tx.label.create({
      data: { name },
      select: { id: true },
    });

    resolvedIds.add(createdLabel.id);
  }

  return [...resolvedIds];
}
  // Retrieve all active clubs.
 // Retrieve active clubs with pagination.
async findAll(pageParam?: string, limitParam?: string) {
  const page = pageParam === undefined ? 1 : Number(pageParam);
  const limit = limitParam === undefined ? 10 : Number(limitParam);

  if (
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    throw new BadRequestException(
      'Page must be a positive integer.',
    );
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new BadRequestException(
      'Limit must be an integer between 1 and 100.',
    );
  }

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw new BadRequestException('Page number is too large.');
  }

  const where: Prisma.ClubWhereInput = {
    status: 'ACTIVE',
  };

  const [clubs, total] = await this.prisma.$transaction([
    this.prisma.club.findMany({
      where,
      skip,
      take: limit,
      include: {
        faculty: {
          select: {
            id: true,
            name: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        eligibleMajors: {
          include: {
            major: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        { name: 'asc' },
        { id: 'asc' },
      ],
    }),

    this.prisma.club.count({
      where,
    }),
  ]);

  return {
    data: clubs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// Deanship only: retrieve all clubs, including archived clubs.
async findAllForDeanship(
  pageParam?: string,
  limitParam?: string,
) {
  const page = pageParam === undefined ? 1 : Number(pageParam);
  const limit = limitParam === undefined ? 10 : Number(limitParam);

  if (!Number.isSafeInteger(page) || page < 1) {
    throw new BadRequestException(
      'Page must be a positive integer.',
    );
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new BadRequestException(
      'Limit must be an integer between 1 and 100.',
    );
  }

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw new BadRequestException('Page number is too large.');
  }

  const [clubs, total] = await this.prisma.$transaction([
    this.prisma.club.findMany({
      skip,
      take: limit,
      include: {
        faculty: {
          select: {
            id: true,
            name: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            fullName: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        eligibleMajors: {
          include: {
            major: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        { name: 'asc' },
        { id: 'asc' },
      ],
    }),

    this.prisma.club.count(),
  ]);

  return {
    data: clubs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

  // Retrieve a single active club.
  async findOne(id: string) {
    const club = await this.prisma.club.findFirst({
      where: {
        id,
        status: 'ACTIVE',
      },
      include: {
        faculty: {
          select: {
            id: true,
            name: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        eligibleMajors: {
          include: {
            major: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return club;
  }

// Deanship only: retrieve a club regardless of its status.
async findOneForDeanship(id: string) {
  const club = await this.prisma.club.findUnique({
    where: {
      id,
    },
    include: {
      membershipSettings: true,

membershipFeeVersions: {
  orderBy: {
    effectiveAt: 'desc',
  },
},

registrationWindows: {
  orderBy: {
    opensAt: 'desc',
  },
  include: {
    effectiveFeeVersion: true,
  },
},
      faculty: {
        select: {
          id: true,
          name: true,
        },
      },
      supervisor: {
  select: {
    id: true,
    fullName: true,
  },
},
      labels: {
        include: {
          label: true,
        },
      },
      eligibleMajors: {
        include: {
          major: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!club) {
    throw new NotFoundException('Club not found');
  }

  return club;
}

  async create(dto: CreateClubDto, assignedById?: string) {
  const membership = dto.membership;

if (!membership) {
  throw new BadRequestException(
    'Membership configuration is required.',
  );
}

if (
  membership.registrationMode !== 'ALWAYS_OPEN' &&
  membership.registrationMode !== 'WINDOWED'
) {
  throw new BadRequestException(
    'Invalid membership registration mode.',
  );
}

if (
  membership.registrationMode === 'ALWAYS_OPEN' &&
  (membership.opensAt || membership.closesAt)
) {
  throw new BadRequestException(
    'Always-open clubs cannot have an initial registration window.',
  );
}

if (membership.registrationMode === 'WINDOWED') {
  if (!membership.opensAt || !membership.closesAt) {
    throw new BadRequestException(
      'Windowed clubs require opening and closing dates.',
    );
  }

  const opensAt = new Date(membership.opensAt);
  const closesAt = new Date(membership.closesAt);

  if (
    !Number.isFinite(opensAt.getTime()) ||
    !Number.isFinite(closesAt.getTime()) ||
    opensAt >= closesAt ||
    opensAt <= new Date()
  ) {
    throw new BadRequestException(
      'The registration window must start in the future and close after opening.',
    );
  }
}
    const name = dto.name.trim();
  const description = dto.description.trim();
  const contactEmail = dto.contactEmail.trim().toLowerCase();

  const majorIds = dto.eligibleMajorIds ?? [];
  const uniqueMajorIds = [...new Set(majorIds)];

  // Validate classification-specific eligibility.
  if (dto.classification === 'GENERAL') {
    if (dto.facultyId || majorIds.length > 0) {
      throw new BadRequestException(
        'General clubs cannot have faculty or major restrictions.',
      );
    }
  }

  if (dto.classification === 'FACULTY_BASED') {
    if (!dto.facultyId || majorIds.length > 0) {
      throw new BadRequestException(
        'Faculty-based clubs require one faculty and no selected majors.',
      );
    }
  }

  if (dto.classification === 'MAJOR_BASED') {
    if (dto.facultyId || uniqueMajorIds.length === 0) {
      throw new BadRequestException(
        'Major-based clubs require selected majors and no faculty.',
      );
    }
  }

  // Validate the selected faculty.
  if (dto.facultyId) {
    const faculty = await this.prisma.faculty.findUnique({
      where: { id: dto.facultyId },
      select: { id: true },
    });

    if (!faculty) {
      throw new BadRequestException('Selected faculty does not exist.');
    }
  }

  // Validate all selected majors, including majors from different faculties.
  if (uniqueMajorIds.length > 0) {
    const existingMajors = await this.prisma.major.findMany({
      where: {
        id: { in: uniqueMajorIds },
      },
      select: { id: true },
    });

    if (existingMajors.length !== uniqueMajorIds.length) {
      throw new BadRequestException(
        'One or more selected majors do not exist.',
      );
    }
  }
  await this.validateSupervisor(dto.supervisorId);
  try {
    return await this.prisma.$transaction(async (tx) => {
      // Resolve existing and newly entered labels.
      const selectedLabelIds = await this.resolveClubLabelIds(
        tx,
        dto.labelIds ?? [],
        dto.newLabels ?? [],
      );

      // Create the club and its relationships together.
      const created = await tx.club.create({
        data: {
          name,
          description,
          contactEmail,
          classification: dto.classification,
          facultyId: dto.facultyId ?? null,
          logoUrl: dto.logoUrl ?? null,
          foundedYear: dto.foundedYear ?? null,
          supervisorId: dto.supervisorId ?? null,
          meetingInfo: dto.meetingInfo ?? null,

          eligibleMajors:
            uniqueMajorIds.length > 0
              ? {
                  create: uniqueMajorIds.map((majorId) => ({
                    major: {
                      connect: { id: majorId },
                    },
                  })),
                }
              : undefined,

          labels:
            selectedLabelIds.length > 0
              ? {
                  create: selectedLabelIds.map((labelId) => ({
                    label: {
                      connect: { id: labelId },
                    },
                  })),
                }
              : undefined,
        },

        include: {
          faculty: true,

          eligibleMajors: {
            include: {
              major: true,
            },
          },

          labels: {
            include: {
              label: true,
            },
          },
        },
      });
    const firstTimeFee = new Prisma.Decimal(membership.firstTimeFee);
    const renewalFee = new Prisma.Decimal(membership.renewalFee);

    if (
      !firstTimeFee.isFinite() ||
      !renewalFee.isFinite() ||
      firstTimeFee.lte(0) ||
      renewalFee.lte(0) ||
      firstTimeFee.decimalPlaces() > 2 ||
      renewalFee.decimalPlaces() > 2
    ) {
      throw new BadRequestException(
        'Membership fees must be positive amounts with at most two decimal places.',
      );
    }

    await tx.clubMembershipSettings.create({
      data: {
        clubId: created.id,
        registrationMode: membership.registrationMode,
        pendingFirstTimeFee: firstTimeFee,
        pendingRenewalFee: renewalFee,
        currency: membership.currency,
      },
    });
if (membership.registrationMode === 'ALWAYS_OPEN') {
  // Always-open clubs publish their membership prices immediately.
  await tx.clubMembershipFeeVersion.create({
    data: {
      clubId: created.id,
      firstTimeFee,
      renewalFee,
      currency: membership.currency,
      effectiveAt: new Date(),
      createdById: assignedById ?? null,
    },
  });
} else if (membership.registrationMode === 'WINDOWED') {
  // Windowed clubs require opening and closing dates.
  if (!membership.opensAt || !membership.closesAt) {
    throw new BadRequestException(
      'Registration opening and closing dates are required.',
    );
  }

  const opensAt = new Date(membership.opensAt);
  const closesAt = new Date(membership.closesAt);
  const now = new Date();

  if (
    !Number.isFinite(opensAt.getTime()) ||
    !Number.isFinite(closesAt.getTime()) ||
    opensAt >= closesAt
  ) {
    throw new BadRequestException(
      'Invalid registration window dates.',
    );
  }

  if (opensAt <= now) {
    throw new BadRequestException(
      'The initial registration window must start in the future.',
    );
  }

  // Create a scheduled registration window.
  // Prices are not locked until the window first opens.
  await tx.clubRegistrationWindow.create({
    data: {
      clubId: created.id,
      opensAt,
      closesAt,
    },
  });
}
    // The form's board selections are held in React until this transaction.
    // Every appointment and administrator is committed atomically with the club.
    const board = dto.boardMembers ?? [];
    const admins = dto.administrators ?? [];
    if (admins.length && !assignedById) throw new BadRequestException('Authenticated Deanship account required.');
    if (admins.length > 2 || new Set(admins.map((a) => a.position)).size !== admins.length ||
        new Set(admins.map((a) => a.boardIndex)).size !== admins.length) {
      throw new BadRequestException('Choose at most one distinct board member for each administrator position.');
    }
    if (new Set(board.map((b) => b.studentId)).size !== board.length) {
      throw new BadRequestException('A student may appear only once in the initial board.');
    }
    const parseDay = (value: string) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new BadRequestException('Invalid board appointment calendar date.');
      }
      return date;
    };
    const currentDay = parseDay(new Date().toISOString().slice(0, 10));
    const appointed: { id: string; accountId: string; startDate: Date; endDate: Date | null }[] = [];
    for (const entry of board) {
      const student = await tx.universityStudent.findUnique({
        where: { id: entry.studentId },
        select: { major: { select: { id: true, facultyId: true } },
          account: { select: { id: true, role: true, status: true } } },
      });
      if (!student?.account || student.account.role !== AccountRole.STUDENT || student.account.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('Every board member must have an active ClubHub student account.');
      }
      if ((dto.classification === 'FACULTY_BASED' && student.major.facultyId !== dto.facultyId) ||
          (dto.classification === 'MAJOR_BASED' && !uniqueMajorIds.includes(student.major.id))) {
        throw new BadRequestException('A selected board member is not eligible for this club.');
      }
      if (!entry.position.trim()) throw new BadRequestException('Board position is required.');
      const startDate = parseDay(entry.startDate);
      const endDate = entry.endDate ? parseDay(entry.endDate) : null;
      if (endDate && endDate < startDate) throw new BadRequestException('Board end date cannot precede start date.');
      const appointment = await tx.boardAppointment.create({
        data: { clubId: created.id, studentId: entry.studentId, position: entry.position.trim(), startDate, endDate },
        select: { id: true },
      });
      appointed.push({ id: appointment.id, accountId: student.account.id, startDate, endDate });
    }
    for (const admin of admins) {
      const appointment = appointed[admin.boardIndex];
      if (!appointment) throw new BadRequestException('Select administrators from the entered board members.');
      if (appointment.endDate && appointment.endDate < currentDay) {
        throw new BadRequestException('An expired board appointment cannot receive administrator access.');
      }
      const existing = await tx.clubAdminAssignment.findFirst({
        where: { accountId: appointment.accountId, revokedAt: null,
          club: { status: 'ACTIVE' },
          boardAppointment: { is: { endedAt: null,
            OR: [{ endDate: null }, { endDate: { gte: currentDay } }] } } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('This student already administers another active club.');
      await tx.clubAdminAssignment.create({ data: {
        clubId: created.id, accountId: appointment.accountId, boardAppointmentId: appointment.id,
        position: admin.position, assignedById: assignedById!,
      } });
    }
    return created;
  });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'A club or label with this name already exists.',
    );
  }

  throw error;
}
}
async activateRegistrationWindowFees(
  clubId: string,
  windowId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    /*
     * Lock the membership settings row first.
     *
     * This serializes fee activation requests for the same club
     * and provides a consistent locking order.
     */
    const settingsLock = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (settingsLock.length === 0) {
      throw new ConflictException(
        'Membership configuration is missing.',
      );
    }

    /*
     * Lock the registration window itself.
     *
     * Concurrent activation attempts must wait rather than
     * creating separate fee versions.
     */
    const windowLock = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubRegistrationWindow"
      WHERE "id" = ${windowId}::uuid
        AND "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (windowLock.length === 0) {
      throw new NotFoundException(
        'Registration window not found.',
      );
    }

    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!club || club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Membership registration is unavailable.',
      );
    }

    const settings =
      await tx.clubMembershipSettings.findUnique({
        where: { clubId },
      });

    if (
      !settings ||
      settings.registrationMode !== 'WINDOWED'
    ) {
      throw new ConflictException(
        'The club is not using scheduled registration.',
      );
    }

    const registrationWindow =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          id: windowId,
          clubId,
        },
      });

    if (!registrationWindow) {
      throw new NotFoundException(
        'Registration window not found.',
      );
    }

    /*
     * A previously locked window is idempotent:
     * return the existing immutable version.
     */
    if (registrationWindow.effectiveFeeVersionId) {
      return registrationWindow;
    }

    const now = new Date();

    /*
     * Only active, unclosed windows may be activated.
     */
    if (
      registrationWindow.opensAt > now ||
      registrationWindow.closesAt <= now ||
      registrationWindow.closedAt !== null ||
      registrationWindow.canceledAt !== null
    ) {
      throw new ConflictException(
        'Registration window is not currently active.',
      );
    }

    /*
     * Create one immutable effective fee snapshot.
     *
     * Its effective time is the scheduled opening time.
     */
    const feeVersion =
      await tx.clubMembershipFeeVersion.create({
        data: {
          clubId,
          firstTimeFee: settings.pendingFirstTimeFee,
          renewalFee: settings.pendingRenewalFee,
          currency: settings.currency,
          effectiveAt: registrationWindow.opensAt,
        },
      });

    /*
     * Associate the new fee version with its window.
     *
     * If this update fails, Prisma rolls back the transaction,
     * including the newly created fee version.
     */
    const updated =
      await tx.clubRegistrationWindow.updateMany({
        where: {
          id: windowId,
          clubId,
          canceledAt: null,
          effectiveFeeVersionId: null,
          closedAt: null,
          opensAt: { lte: now },
          closesAt: { gt: now },
        },
        data: {
          effectiveFeeVersionId: feeVersion.id,
        },
      });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Registration window changed during activation.',
      );
    }

    return tx.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });
  });
}
private async getEffectiveMembershipFees(
  feeVersionId: string,
): Promise<EffectiveMembershipFees> {
  const version =
    await this.prisma.clubMembershipFeeVersion.findUnique({
      where: {
        id: feeVersionId,
      },
      select: {
        id: true,
        firstTimeFee: true,
        renewalFee: true,
        currency: true,
        effectiveAt: true,
      },
    });

  if (!version) {
    throw new ConflictException(
      'The effective membership fee version could not be found.',
    );
  }

  return {
    firstTimeFee: version.firstTimeFee.toFixed(2),
    renewalFee: version.renewalFee.toFixed(2),
    currency: version.currency,
    feeVersionId: version.id,
    effectiveAt: version.effectiveAt,
  };
}
/** Sprint 5.E: derive pricing from the existing availability resolver and confirmed history. */
async getMembershipQuoteForAccount(
  accountId: string,
  clubId: string,
  academicallyEligible: boolean,
) {
  const account = await this.prisma.account.findUnique({
    where: { id: accountId },
    select: { universityStudentId: true },
  });
  if (!account?.universityStudentId) {
    throw new NotFoundException('Student profile not found.');
  }

  const now = new Date();
  const [anyConfirmedMembership, activeMembership, availability] =
    await Promise.all([
      this.prisma.membership.findFirst({
        where: {
          clubId,
          studentId: account.universityStudentId,
          activatedAt: { lte: now },
        },
        select: { id: true },
      }),
      this.prisma.membership.findFirst({
        where: {
          clubId,
          studentId: account.universityStudentId,
          activatedAt: { lte: now },
          expiresAt: { gt: now },
        },
        select: { id: true, expiresAt: true },
      }),
      this.getMembershipAvailability(clubId),
    ]);

  const canApply = academicallyEligible &&
    availability.registrationAvailable && !activeMembership;
  const feeType = !canApply
    ? null
    : anyConfirmedMembership ? 'RENEWAL' as const : 'FIRST_TIME' as const;
  const effectiveFees = availability.effectiveFees;

  return {
    registrationAvailable: availability.registrationAvailable,
    availabilityStatus: availability.status,
    alreadyActiveMember: Boolean(activeMembership),
    activeMembershipExpiresAt: activeMembership?.expiresAt ?? null,
    hasPreviousMembership: Boolean(anyConfirmedMembership),
    canApply,
    feeType,
    amount: feeType && effectiveFees
      ? feeType === 'RENEWAL'
        ? effectiveFees.renewalFee
        : effectiveFees.firstTimeFee
      : null,
    currency: feeType ? (effectiveFees?.currency ?? null) : null,
    feeVersionId: feeType ? (effectiveFees?.feeVersionId ?? null) : null,
  };
}
async getMembershipAvailability(
  clubId: string,
): Promise<MembershipAvailabilityResult> {
  try {
    return await this.resolveMembershipAvailabilityOnce(
      clubId,
    );
  } catch (error) {
    /*
     * A registration window may have closed,
     * or a club may have been archived,
     * between the initial availability read
     * and fee activation.
     *
     * If activation encounters a conflict,
     * retrieve the current availability again.
     */
    if (!(error instanceof ConflictException)) {
      throw error;
    }

    return this.resolveMembershipAvailabilityOnce(
      clubId,
    );
  }
}
private async resolveMembershipAvailabilityOnce(
  clubId: string,
): Promise<MembershipAvailabilityResult> {
  const now = new Date();

  const club = await this.prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      status: true,

      membershipSettings: {
        select: {
          registrationMode: true,
        },
      },

      registrationWindows: {
  where: {
    canceledAt: null,
  },
  select: {
    id: true,
    opensAt: true,
    closesAt: true,
    closedAt: true,
    canceledAt: true,
    effectiveFeeVersionId: true,
  },
  orderBy: {
    opensAt: 'asc',
  },
},
    },
  });

  if (!club) {
    throw new NotFoundException('Club not found.');
  }

  const registrationMode =
    club.membershipSettings?.registrationMode ?? null;

  const base = {
    clubId: club.id,
    registrationMode,
    checkedAt: now,
  };

  if (club.status !== 'ACTIVE') {
    return {
      ...base,
      status: 'CLUB_ARCHIVED',
      registrationAvailable: false,
      effectiveFees: null,
      window: null,
    };
  }

  if (!club.membershipSettings) {
    return {
      ...base,
      status: 'NOT_CONFIGURED',
      registrationAvailable: false,
      effectiveFees: null,
      window: null,
    };
  }

if (registrationMode === 'ALWAYS_OPEN') {
  const latestVersion =
    await this.prisma.clubMembershipFeeVersion.findFirst({
      where: {
        clubId,
        effectiveAt: {
          lte: now,
        },
      },
      orderBy: [
        { effectiveAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
      },
    });

  if (!latestVersion) {
    throw new ConflictException(
      'An effective membership fee version is missing for this club.',
    );
  }

const effectiveFees =
  await this.getEffectiveMembershipFees(
    latestVersion.id,
  );

/*
 * Sprint 5.D.5d.3 — ALWAYS_OPEN lifecycle validation.
 *
 * The club may have been archived while the effective
 * membership fees were being retrieved.
 *
 * Recheck the authoritative club status and registration
 * mode before reporting registration as available.
 */
const latestState = await this.prisma.club.findUnique({
  where: {
    id: clubId,
  },
  select: {
    status: true,
    membershipSettings: {
      select: {
        registrationMode: true,
      },
    },
  },
});

if (
  latestState?.status !== 'ACTIVE' ||
  latestState.membershipSettings?.registrationMode !==
    'ALWAYS_OPEN'
) {
  throw new ConflictException(
    'Membership availability changed during resolution.',
  );
}

return {
  ...base,
  checkedAt: new Date(),
  status: 'ALWAYS_OPEN',
  registrationAvailable: true,
  effectiveFees,
  window: null,
};
}

  const windows = club.registrationWindows;

  if (windows.length === 0) {
    return {
      ...base,
      status: 'NOT_SCHEDULED',
      registrationAvailable: false,
      effectiveFees: null,
      window: null,
    };
  }

  // 1. Find a currently open registration window.
  const activeWindow = windows.find(
    (window) =>
      window.opensAt <= now &&
      window.closesAt > now &&
      window.closedAt === null,
  );

if (activeWindow) {
  let resolvedWindow = activeWindow;

  if (!activeWindow.effectiveFeeVersionId) {
    resolvedWindow =
      await this.activateRegistrationWindowFees(
        clubId,
        activeWindow.id,
      );
  }

  if (!resolvedWindow.effectiveFeeVersionId) {
    throw new ConflictException(
      'The registration window has no locked fee version.',
    );
  }

  const effectiveFees =
  await this.getEffectiveMembershipFees(
    resolvedWindow.effectiveFeeVersionId,
  );

/*
 * Final lifecycle validation.
 *
 * The initial availability query may be outdated by the time
 * price activation and fee resolution finish.
 *
 * Recheck both the club and registration window before
 * returning OPEN.
 */
const latestState = await this.prisma.club.findUnique({
  where: {
    id: clubId,
  },
  select: {
    status: true,

    membershipSettings: {
      select: {
        registrationMode: true,
      },
    },

    registrationWindows: {
      where: {
        id: resolvedWindow.id,
      },
      select: {
        id: true,
        opensAt: true,
        closesAt: true,
        closedAt: true,
        effectiveFeeVersionId: true,
        canceledAt: true,
      },
    },
  },
});

const latestWindow = latestState?.registrationWindows?.[0];
const checkedAt = new Date();

if (
  latestState?.status !== 'ACTIVE' ||
  latestState.membershipSettings?.registrationMode !==
    'WINDOWED' ||
  !latestWindow ||
  latestWindow.opensAt > checkedAt ||
  latestWindow.closesAt <= checkedAt ||
  latestWindow.closedAt !== null ||
  latestWindow.canceledAt !== null ||
  latestWindow.effectiveFeeVersionId !==
    resolvedWindow.effectiveFeeVersionId
) {
  throw new ConflictException(
    'Registration availability changed during resolution.',
  );
}

return {
  ...base,
  checkedAt,
  status: 'OPEN',
  registrationAvailable: true,
  effectiveFees,
  window: latestWindow,
};
}

  // 2. Find the earliest upcoming registration window.
  // Windows are ordered by opensAt ascending.
  const upcomingWindow = windows.find(
    (window) =>
      window.opensAt > now &&
      window.closedAt === null,
  );

  if (upcomingWindow) {
    return {
      ...base,
      status: 'SCHEDULED',
      registrationAvailable: false,
      window: upcomingWindow,
      effectiveFees: null,
    };
  }

  // 3. No active or upcoming window exists.
  // Return the most recently completed window.
  const mostRecentWindow = [...windows].sort(
    (a, b) =>
      b.opensAt.getTime() - a.opensAt.getTime(),
  )[0];

  if (mostRecentWindow.closedAt !== null) {
    return {
      ...base,
      status: 'CLOSED_EARLY',
      registrationAvailable: false,
      window: mostRecentWindow,
      effectiveFees: null,
    };
  }

  return {
    ...base,
    status: 'CLOSED',
    registrationAvailable: false,
    window: mostRecentWindow,
    effectiveFees: null,
  };
}
/** Configure membership fees for an existing club created before Sprint 5. */
async initializeMembership(
  clubId: string,
  dto: InitializeMembershipDto,
  actorId: string,
) {
  const firstTimeFee = new Prisma.Decimal(dto.firstTimeFee);
  const renewalFee = new Prisma.Decimal(dto.renewalFee);
  if (
    !firstTimeFee.isFinite() || !renewalFee.isFinite() ||
    firstTimeFee.lte(0) || renewalFee.lte(0) ||
    firstTimeFee.decimalPlaces() > 2 || renewalFee.decimalPlaces() > 2 ||
    firstTimeFee.gt('99999999.99') || renewalFee.gt('99999999.99')
  ) {
    throw new BadRequestException(
      'Membership fees must be positive amounts with at most two decimal places.',
    );
  }

  return this.prisma.$transaction(async (tx) => {
    // A club-row lock serializes concurrent initializations even when the
    // membership-settings row does not exist yet.
    const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "Club" WHERE id = ${clubId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundException('Club not found.');
    if (locked[0].status !== 'ACTIVE') {
      throw new ConflictException('Archived clubs cannot configure membership.');
    }

    const existing = await tx.clubMembershipSettings.findUnique({
      where: { clubId }, select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Membership settings already exist. Reload the club.');
    }
    // Don't silently turn a partially migrated club's historical prices or
    // windows into an unrelated always-open membership configuration.
    const [oldVersions, oldWindows] = await Promise.all([
      tx.clubMembershipFeeVersion.count({ where: { clubId } }),
      tx.clubRegistrationWindow.count({ where: { clubId } }),
    ]);
    if (oldVersions || oldWindows) {
      throw new ConflictException(
        'This club has existing membership history. Review it before initialization.',
      );
    }

    const settings = await tx.clubMembershipSettings.create({
      data: {
        clubId,
        registrationMode: 'ALWAYS_OPEN',
        pendingFirstTimeFee: firstTimeFee,
        pendingRenewalFee: renewalFee,
        currency: 'ILS',
      },
    });
    await tx.clubMembershipFeeVersion.create({
      data: {
        clubId,
        firstTimeFee,
        renewalFee,
        currency: 'ILS',
        effectiveAt: new Date(),
        createdById: actorId,
      },
    });
    return { message: 'Membership configured.', settings };
  });
}

async updateMembershipFees(
  clubId: string,
  dto: UpdateMembershipFeesDto,
  actorId: string,
) {
  const firstTimeFee = new Prisma.Decimal(dto.firstTimeFee);
  const renewalFee = new Prisma.Decimal(dto.renewalFee);

  if (
    !firstTimeFee.isFinite() ||
    !renewalFee.isFinite() ||
    firstTimeFee.lte(0) ||
    renewalFee.lte(0) ||
    firstTimeFee.decimalPlaces() > 2 ||
    renewalFee.decimalPlaces() > 2 ||
    firstTimeFee.gt('99999999.99') ||
    renewalFee.gt('99999999.99')
  ) {
    throw new BadRequestException(
      'Membership fees must be positive amounts with at most two decimal places.',
    );
  }

  return this.prisma.$transaction(async (tx) => {
    // Use the same lock as registration-window activation.
// All fee changes and activation attempts for this club
// must serialize through its membership-settings row.
const settingsLock = await tx.$queryRaw<{ id: string }[]>`
  SELECT "id"
  FROM "ClubMembershipSettings"
  WHERE "clubId" = ${clubId}::uuid
  FOR UPDATE
`;

if (settingsLock.length === 0) {
  throw new ConflictException(
    'This club has no membership configuration.',
  );
}
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: { id: true, status: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    if (club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Membership fees cannot be changed for an archived club.',
      );
    }

    const settings = await tx.clubMembershipSettings.findUnique({
      where: { clubId },
    });

    if (!settings) {
      throw new ConflictException(
        'This club has no membership configuration.',
      );
    }

    if (settings.configVersion !== dto.configVersion) {
      throw new ConflictException(
        'Membership settings changed. Reload the page before saving.',
      );
    }

    const unchanged =
      settings.pendingFirstTimeFee.equals(firstTimeFee) &&
      settings.pendingRenewalFee.equals(renewalFee);

    if (unchanged) {
      return {
        message: 'Membership fees are already up to date.',
        settings,
      };
    }



// Evaluate time after acquiring the membership-settings lock.
// PostgreSQL supplies the timestamp used for this decision.
const clockRows = await tx.$queryRaw<{ now: Date }[]>`
  SELECT clock_timestamp() AS now
`;

const now = clockRows[0].now;




/*
 * Pending fee changes apply to future registration windows.
 *
 * IMPORTANT: Before this update is enabled in a running database,
 * the database must be able to snapshot every already-opened window
 * under the same membership-settings lock. That protection is
 * provided by the separate Sprint 5.D.6 database migration.
 *
 * Current-window effective fee versions remain immutable.
 */
const updated = await tx.clubMembershipSettings.updateMany({
  where: {
    clubId,
    configVersion: dto.configVersion,
  },
  data: {
    pendingFirstTimeFee: firstTimeFee,
    pendingRenewalFee: renewalFee,
    configVersion: { increment: 1 },
  },
});

if (updated.count !== 1) {
  throw new ConflictException(
    'Membership settings changed. Reload before saving.',
  );
}

    // Always-open clubs have no future window activation event.
    // Publish a new immutable effective fee version immediately.
    if (settings.registrationMode === 'ALWAYS_OPEN') {
      await tx.clubMembershipFeeVersion.create({
        data: {
          clubId,
          firstTimeFee,
          renewalFee,
          currency: settings.currency,
          effectiveAt: now,
          createdById: actorId,
        },
      });
    }

    // Windowed clubs only update their pending settings.
    // The window activation logic in Sprint 5.D will
    // create and lock the effective fee version.
    return {
      message:
        settings.registrationMode === 'ALWAYS_OPEN'
          ? 'Membership fees updated and effective immediately.'
          : 'Future membership fees saved.',
      settings: await tx.clubMembershipSettings.findUniqueOrThrow({
        where: { clubId },
      }),
    };
  });
}
async updateMembershipMode(
  clubId: string,
  dto: UpdateMembershipModeDto,
) {
  return this.prisma.$transaction(async (tx) => {
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: { id: true, status: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    if (club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Archived clubs cannot change registration settings.',
      );
    }

    // Lock settings before modifying any registration windows.
    // This follows the locking order used by fee activation.
    const lockedSettings = await tx.$queryRaw<
      { id: string }[]
    >`
      SELECT "id"
      FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (lockedSettings.length === 0) {
      throw new ConflictException(
        'Membership configuration is missing.',
      );
    }

    const settings =
      await tx.clubMembershipSettings.findUniqueOrThrow({
        where: { clubId },
      });

    if (settings.configVersion !== dto.configVersion) {
      throw new ConflictException(
        'Configuration changed. Reload before saving.',
      );
    }

    if (settings.registrationMode === dto.registrationMode) {
      return settings;
    }

    const now = new Date();

    if (dto.registrationMode === 'ALWAYS_OPEN') {
      // Cancel every future, unlocked registration window.
      // Canceled windows remain in the database for audit history.
      await tx.clubRegistrationWindow.updateMany({
        where: {
          clubId,
          
          opensAt: { gt: now },
          canceledAt: null,
          closedAt: null,
          effectiveFeeVersionId: null,
        },
        data: {
          canceledAt: now,
        },
      });

      // End any currently active window.
      // Historical fee snapshots remain immutable.
      await tx.clubRegistrationWindow.updateMany({
        where: {
          clubId,
          opensAt: { lte: now },
          closesAt: { gt: now },
          closedAt: null,
          canceledAt: null,
        },
        data: {
          closedAt: now,
        },
      });

      // Detect windows that crossed their opening boundary
      // or changed concurrently during the transition.
      const remainingWindows =
        await tx.clubRegistrationWindow.findFirst({
          where: {
            clubId,
            closesAt: { gt: now },
            canceledAt: null,
            closedAt: null,
          },
          select: { id: true },
        });

      if (remainingWindows) {
        throw new ConflictException(
          'Registration windows changed during the policy switch. Reload and retry.',
        );
      }
    }

    const updated =
      await tx.clubMembershipSettings.updateMany({
        where: {
          clubId,
          configVersion: dto.configVersion,
        },
        data: {
          registrationMode: dto.registrationMode,
          configVersion: { increment: 1 },
        },
      });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Configuration changed. Reload before saving.',
      );
    }

    if (dto.registrationMode === 'ALWAYS_OPEN') {
      await tx.clubMembershipFeeVersion.create({
        data: {
          clubId,
          firstTimeFee: settings.pendingFirstTimeFee,
          renewalFee: settings.pendingRenewalFee,
          currency: settings.currency,
          effectiveAt: now,
        },
      });
    }

    return tx.clubMembershipSettings.findUniqueOrThrow({
      where: { clubId },
    });
  });
}
private validateRegistrationWindowDates(
  dto: RegistrationWindowDatesDto,
) {
  const opensAt = new Date(dto.opensAt);
  const closesAt = new Date(dto.closesAt);
  const now = new Date();

  if (
    !Number.isFinite(opensAt.getTime()) ||
    !Number.isFinite(closesAt.getTime())
  ) {
    throw new BadRequestException(
      'Invalid registration dates.',
    );
  }

  if (opensAt <= now) {
    throw new BadRequestException(
      'Registration must start in the future.',
    );
  }

  if (closesAt <= opensAt) {
    throw new BadRequestException(
      'Closing date must be after opening date.',
    );
  }

  return { opensAt, closesAt };
}
async createRegistrationWindow(
  clubId: string,
  dto: RegistrationWindowDatesDto,
) {
  const { opensAt, closesAt } =
    this.validateRegistrationWindowDates(dto);

  return this.prisma.$transaction(async (tx) => {
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: { id: true, status: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    if (club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Cannot schedule registration for an archived club.',
      );
    }

    const settings =
      await tx.clubMembershipSettings.findUnique({
        where: { clubId },
      });

    if (!settings) {
      throw new ConflictException(
        'Membership configuration is missing.',
      );
    }

    if (settings.registrationMode !== 'WINDOWED') {
      throw new ConflictException(
        'Switch the club to Scheduled Registration first.',
      );
    }

    const overlapping =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          clubId,
          canceledAt: null,
          opensAt: { lt: closesAt },
          closesAt: { gt: opensAt },
          OR: [
            { closedAt: null },
            { closedAt: { gt: opensAt } },
          ],
        },
        select: { id: true },
      });

    if (overlapping) {
      throw new ConflictException(
        'This registration period overlaps an existing window.',
      );
    }

    return tx.clubRegistrationWindow.create({
      data: {
        clubId,
        opensAt,
        closesAt,
      },
    });
  });
}
async cancelScheduledRegistrationWindow(
  clubId: string,
  windowId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    // Preserve the existing membership lifecycle locking order:
    // membership settings first, registration window second.
    const settingsLock = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (settingsLock.length === 0) {
      throw new ConflictException(
        'Membership configuration is missing.',
      );
    }

    const windowLock = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubRegistrationWindow"
      WHERE "id" = ${windowId}::uuid
        AND "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (windowLock.length === 0) {
      throw new NotFoundException(
        'Registration window not found.',
      );
    }

    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: {
        status: true,
        membershipSettings: {
          select: {
            registrationMode: true,
          },
        },
      },
    });

    if (!club || club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Archived or missing clubs cannot cancel registration windows.',
      );
    }

    if (
      club.membershipSettings?.registrationMode !== 'WINDOWED'
    ) {
      throw new ConflictException(
        'Registration must be in Scheduled mode.',
      );
    }

    const existing =
      await tx.clubRegistrationWindow.findUniqueOrThrow({
        where: { id: windowId },
      });

    // Use PostgreSQL time as the authoritative clock.
    const clock = await tx.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;

    const now = clock[0].now;

    if (
      existing.opensAt <= now ||
      existing.closedAt !== null ||
      existing.canceledAt !== null ||
      existing.effectiveFeeVersionId !== null
    ) {
      throw new ConflictException(
        'Only future, unlocked registration windows can be canceled.',
      );
    }

    // Preserve the existing record. Never hard-delete history.
    const result = await tx.clubRegistrationWindow.updateMany({
      where: {
        id: windowId,
        clubId,
        opensAt: { gt: now },
        closedAt: null,
        canceledAt: null,
        effectiveFeeVersionId: null,
      },
      data: {
        canceledAt: now,
      },
    });

    if (result.count !== 1) {
      throw new ConflictException(
        'Registration window changed. Reload and retry.',
      );
    }

    return tx.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });
  });
}
async closeRegistrationWindow(
  clubId: string,
  windowId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    if (club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Registration cannot be closed for an archived club.',
      );
    }

    const settings =
      await tx.clubMembershipSettings.findUnique({
        where: { clubId },
      });

    if (!settings) {
      throw new ConflictException(
        'Membership configuration is missing.',
      );
    }

    if (settings.registrationMode !== 'WINDOWED') {
      throw new ConflictException(
        'The club is not using scheduled registration.',
      );
    }

    const existing =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          id: windowId,
          clubId,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Registration window not found.',
      );
    }

    const now = new Date();

    // Early closure is allowed only while the window is active.
    if (existing.opensAt > now) {
      throw new ConflictException(
        'A future registration window cannot be closed early.',
      );
    }

    if (existing.closesAt <= now) {
      throw new ConflictException(
        'This registration window has already expired.',
      );
    }

    if (existing.closedAt !== null) {
      throw new ConflictException(
        'This registration window is already closed.',
      );
    }

    // Conditional update protects against another administrator
    // closing the window between our read and write.
    const updated =
      await tx.clubRegistrationWindow.updateMany({
        where: {
          id: windowId,
          clubId,
          opensAt: { lte: now },
          closesAt: { gt: now },
          closedAt: null,
        },
        data: {
          closedAt: now,
        },
      });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Registration window changed. Reload before closing.',
      );
    }

    return tx.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });
  });
}
async extendRegistrationWindow(
  clubId: string,
  windowId: string,
  closesAtValue: string,
) {
  const newClosesAt = new Date(closesAtValue);

  if (!Number.isFinite(newClosesAt.getTime())) {
    throw new BadRequestException('Invalid closing date.');
  }

  return this.prisma.$transaction(async (tx) => {
    // Match the membership lifecycle's locking order:
    // settings first, then registration window.
    const settingsLock = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubMembershipSettings"
      WHERE "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (settingsLock.length === 0) {
      throw new ConflictException(
        'Membership configuration is missing.',
      );
    }

    const windowLock = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "ClubRegistrationWindow"
      WHERE "id" = ${windowId}::uuid
        AND "clubId" = ${clubId}::uuid
      FOR UPDATE
    `;

    if (windowLock.length === 0) {
      throw new NotFoundException(
        'Registration window not found.',
      );
    }

    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: {
        status: true,
        membershipSettings: {
          select: { registrationMode: true },
        },
      },
    });

    if (!club || club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Archived or missing clubs cannot extend registration.',
      );
    }

    if (
      club.membershipSettings?.registrationMode !== 'WINDOWED'
    ) {
      throw new ConflictException(
        'Registration must be in Scheduled mode.',
      );
    }

    const existing =
      await tx.clubRegistrationWindow.findUniqueOrThrow({
        where: { id: windowId },
      });

    const clock = await tx.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;

    const now = clock[0].now;

    // Only currently active windows may be extended.
    if (
      existing.opensAt > now ||
      existing.closesAt <= now ||
      existing.closedAt !== null ||
      existing.canceledAt !== null ||
      existing.effectiveFeeVersionId === null
    ) {
      throw new ConflictException(
        'Only an active registration window with locked fees can be extended.',
      );
    }

    if (
      newClosesAt <= existing.closesAt ||
      newClosesAt <= now
    ) {
      throw new BadRequestException(
        'The new closing date must be later than the current closing date.',
      );
    }

    // A window must not overlap another scheduled or
    // currently effective registration interval.
    const overlapping =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          clubId,
          id: { not: windowId },
          canceledAt: null,
          opensAt: { lt: newClosesAt },
          closesAt: { gt: existing.opensAt },
          OR: [
            { closedAt: null },
            { closedAt: { gt: existing.opensAt } },
          ],
        },
        select: { id: true },
      });

    if (overlapping) {
      throw new ConflictException(
        'The extended window would overlap another registration window.',
      );
    }

    // Update only closesAt. Never replace the window
    // or modify its locked membership fee version.
    return tx.clubRegistrationWindow.update({
      where: { id: windowId },
      data: { closesAt: newClosesAt },
    });
  });
}
async updateRegistrationWindow(
  clubId: string,
  windowId: string,
  dto: RegistrationWindowDatesDto,
) {
  const { opensAt, closesAt } =
    this.validateRegistrationWindowDates(dto);

  return this.prisma.$transaction(async (tx) => {
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: { id: true, status: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    if (club.status !== 'ACTIVE') {
      throw new ConflictException(
        'Archived clubs cannot modify registration windows.',
      );
    }

    const settings =
      await tx.clubMembershipSettings.findUnique({
        where: { clubId },
      });

    if (settings?.registrationMode !== 'WINDOWED') {
      throw new ConflictException(
        'Registration must be in Scheduled mode.',
      );
    }

    const existing =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          id: windowId,
          clubId,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Registration window not found.',
      );
    }

    const now = new Date();

    if (
      existing.opensAt <= now ||
      existing.closedAt !== null ||
      existing.canceledAt !== null ||
      existing.effectiveFeeVersionId !== null
    ) {
      throw new ConflictException(
        'Only future, unlocked registration windows can be edited.',
      );
    }

    const overlapping =
      await tx.clubRegistrationWindow.findFirst({
        where: {
          clubId,
          canceledAt: null,
          id: { not: windowId },
          opensAt: { lt: closesAt },
          closesAt: { gt: opensAt },
          OR: [
            { closedAt: null },
            { closedAt: { gt: opensAt } },
          ],
        },
        select: { id: true },
      });

    if (overlapping) {
      throw new ConflictException(
        'The updated dates overlap another registration window.',
      );
    }

    const result =
      await tx.clubRegistrationWindow.updateMany({
        where: {
          id: windowId,
          clubId,
          opensAt: { gt: now },
          closedAt: null,
          canceledAt: null,
          effectiveFeeVersionId: null,
        },
        data: {
          opensAt,
          closesAt,
        },
      });

    if (result.count !== 1) {
      throw new ConflictException(
        'Registration window changed. Reload before editing.',
      );
    }

    return tx.clubRegistrationWindow.findUniqueOrThrow({
      where: { id: windowId },
    });
  });
}
async update(id: string, dto: UpdateClubDto) {
  const existing = await this.prisma.club.findUnique({
    where: { id },
    include: {
      eligibleMajors: {
        select: { majorId: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundException('Club not found.');
  }

  // Combine existing values with the submitted changes.
  const classification = dto.classification ?? existing.classification;
  const facultyId =
    dto.facultyId !== undefined ? dto.facultyId : existing.facultyId;

  const majorIds =
    dto.eligibleMajorIds !== undefined
      ? dto.eligibleMajorIds
      : existing.eligibleMajors.map((item) => item.majorId);

  const uniqueMajorIds = [...new Set(majorIds)];

  // Validate the club's resulting eligibility configuration.
  if (classification === 'GENERAL') {
    if (facultyId || uniqueMajorIds.length > 0) {
      throw new BadRequestException(
        'General clubs cannot have faculty or major restrictions.',
      );
    }
  }

  if (classification === 'FACULTY_BASED') {
    if (!facultyId || uniqueMajorIds.length > 0) {
      throw new BadRequestException(
        'Faculty-based clubs require one faculty and no selected majors.',
      );
    }
  }

  if (classification === 'MAJOR_BASED') {
    if (facultyId || uniqueMajorIds.length === 0) {
      throw new BadRequestException(
        'Major-based clubs require selected majors and no faculty.',
      );
    }
  }

  // Verify the selected faculty exists.
  if (facultyId) {
    const faculty = await this.prisma.faculty.findUnique({
      where: { id: facultyId },
      select: { id: true },
    });

    if (!faculty) {
      throw new BadRequestException('Selected faculty does not exist.');
    }
  }

  // Verify all selected majors exist.
  if (uniqueMajorIds.length > 0) {
    const majors = await this.prisma.major.findMany({
      where: {
        id: { in: uniqueMajorIds },
      },
      select: { id: true },
    });

    if (majors.length !== uniqueMajorIds.length) {
      throw new BadRequestException(
        'One or more selected majors do not exist.',
      );
    }
  }
  if (dto.supervisorId !== undefined) {
  await this.validateSupervisor(dto.supervisorId);
}

  try {
    return await this.prisma.$transaction(async (tx) => {
      // Update the club without replacing its database record.
      await tx.club.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && {
            name: dto.name.trim(),
          }),
          ...(dto.description !== undefined && {
            description: dto.description.trim(),
          }),
          ...(dto.contactEmail !== undefined && {
            contactEmail: dto.contactEmail.trim().toLowerCase(),
          }),
          ...(dto.classification !== undefined && {
            classification: dto.classification,
          }),
          ...(dto.facultyId !== undefined && {
            facultyId: dto.facultyId ?? null,
          }),
          ...(dto.logoUrl !== undefined && {
            logoUrl: dto.logoUrl,
          }),
          ...(dto.foundedYear !== undefined && {
            foundedYear: dto.foundedYear,
          }),
          ...(dto.meetingInfo !== undefined && {
            meetingInfo: dto.meetingInfo,
          }),
          ...(dto.supervisorId !== undefined && {
            supervisorId: dto.supervisorId,
          }),
        },
      });

      // Replace eligible majors only when explicitly supplied.
      if (dto.eligibleMajorIds !== undefined) {
        await tx.clubEligibleMajor.deleteMany({
          where: { clubId: id },
        });

        if (uniqueMajorIds.length > 0) {
          await tx.clubEligibleMajor.createMany({
            data: uniqueMajorIds.map((majorId) => ({
              clubId: id,
              majorId,
            })),
          });
        }
      }
       // Sprint 3.6: Update labels only when explicitly requested.
if (
  dto.labelIds !== undefined ||
  dto.newLabels !== undefined
) {
  // If only new labels were supplied, preserve existing selections.
  const existingLabelIds =
    dto.labelIds ??
    (
      await tx.clubLabel.findMany({
        where: { clubId: id },
        select: { labelId: true },
      })
    ).map((item) => item.labelId);

  const selectedLabelIds = await this.resolveClubLabelIds(
    tx,
    existingLabelIds,
    dto.newLabels ?? [],
  );

  // Replace this club's associations, not the global labels.
  await tx.clubLabel.deleteMany({
    where: { clubId: id },
  });

  if (selectedLabelIds.length > 0) {
    await tx.clubLabel.createMany({
      data: selectedLabelIds.map((labelId) => ({
        clubId: id,
        labelId,
      })),
    });
  }
}
    return tx.club.findUniqueOrThrow({
  where: { id },
  include: {
    faculty: true,

    eligibleMajors: {
      include: {
        major: true,
      },
    },

    labels: {
      include: {
        label: true,
      },
    },
  },
});
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A club with this name already exists.');
    }

    throw error;
  }
}
// Sprint 3.3: Archive an active club.
async archive(id: string) {
  const result = await this.prisma.club.updateMany({
    where: {
      id,
      status: 'ACTIVE',
    },
    data: {
      status: 'ARCHIVED',
    },
  });

  if (result.count === 0) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    throw new ConflictException('Club is already archived.');
  }

  return this.findOneForDeanship(id);
}

// Sprint 3.3: Reactivate an archived club.
async activate(id: string) {
  const result = await this.prisma.club.updateMany({
    where: {
      id,
      status: 'ARCHIVED',
    },
    data: {
      status: 'ACTIVE',
    },
  });

  if (result.count === 0) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    throw new ConflictException('Club is already active.');
  }

  return this.findOneForDeanship(id);
}


// Sprint 3.4: Assign or reassign a supervisor to a club.
async assignSupervisor(
  clubId: string,
  supervisorId: string,
) {
  // Verify that the club exists.
  const club = await this.prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true },
  });

  if (!club) {
    throw new NotFoundException('Club not found.');
  }

  // Verify that the supervisor exists.
  const supervisor =
    await this.prisma.supervisorProfile.findUnique({
      where: { id: supervisorId },
      include: {
        account: {
          select: {
            status: true,
            role: true,
          },
        },
      },
    });

  if (!supervisor) {
    throw new NotFoundException(
      'Supervisor not found.',
    );
  }

  // Reject disabled supervisors or accounts without
  // the SUPERVISOR role.
  if (
    supervisor.account.status !== AccountStatus.ACTIVE ||
    supervisor.account.role !== AccountRole.SUPERVISOR
  ) {
    throw new BadRequestException(
      'Only active supervisors can be assigned to clubs.',
    );
  }

  // Save the supervisor assignment.
  return this.prisma.club.update({
    where: { id: clubId },
    data: {
      supervisorId,
    },
    include: {
      supervisor: {
        select: {
          id: true,
          fullName: true,
          faculty: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
}




}