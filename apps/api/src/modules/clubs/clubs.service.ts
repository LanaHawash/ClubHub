import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  AccountStatus,
  AccountRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

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

  async create(dto: CreateClubDto) {
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
    return tx.club.create({
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