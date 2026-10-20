import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  // Retrieve all active clubs.
  async findAll() {
    return this.prisma.club.findMany({
      where: {
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
      orderBy: {
        name: 'asc',
      },
    });
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

  try {
    return await this.prisma.club.create({
      data: {
        name,
        description,
        contactEmail,
        classification: dto.classification,
        facultyId: dto.facultyId ?? null,
        logoUrl: dto.logoUrl ?? null,
        foundedYear: dto.foundedYear ?? null,
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
      },
      include: {
        faculty: true,
        eligibleMajors: {
          include: {
            major: true,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A club with this name already exists.',
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

      return tx.club.findUniqueOrThrow({
        where: { id },
        include: {
          faculty: true,
          eligibleMajors: {
            include: {
              major: true,
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
}