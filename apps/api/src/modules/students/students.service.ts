import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountRole, AccountStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private readonly studentProfileSelect = {
    id: true,
    universityId: true,
    email: true,
    fullName: true,

    major: {
      select: {
        id: true,
        name: true,
        faculty: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },

    account: {
      select: {
        id: true,
        role: true,
        status: true,
        profilePhotoUrl: true,
      },
    },
  } as const;

  async getMyProfile(accountId: string) {
    const student = await this.prisma.universityStudent.findFirst({
      where: {
        account: {
          is: {
            id: accountId,
          },
        },
      },
      select: this.studentProfileSelect,
    });

    if (!student) {
      throw new NotFoundException(
        'Student profile not found',
      );
    }

    return student;
  }

  async getAllStudents() {
    return this.prisma.universityStudent.findMany({
      select: this.studentProfileSelect,
      orderBy: {
        fullName: 'asc',
      },
    });
  }

  async getStudentById(studentId: string) {
    const student = await this.prisma.universityStudent.findUnique({
      where: {
        id: studentId,
      },
      select: this.studentProfileSelect,
    });

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    return student;
  }
  // Sprint 4.2.2: Search active ClubHub student accounts
// for club board appointments.
async searchBoardCandidates(
  search?: string,
  pageParam?: string,
  limitParam?: string,
) {
  const query = search?.trim() ?? '';

  if (query.length < 2) {
    throw new BadRequestException(
      'Search must contain at least 2 characters.',
    );
  }

  if (query.length > 150) {
    throw new BadRequestException(
      'Search must not exceed 150 characters.',
    );
  }

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
    limit > 50
  ) {
    throw new BadRequestException(
      'Limit must be between 1 and 50.',
    );
  }

  const where = {
    account: {
      is: {
        role: AccountRole.STUDENT,
        status: AccountStatus.ACTIVE,
      },
    },
    OR: [
      {
        fullName: {
          contains: query,
          mode: 'insensitive' as const,
        },
      },
      {
        universityId: {
          contains: query,
        },
      },
    ],
  };

  const skip = (page - 1) * limit;

  const [students, total] = await this.prisma.$transaction([
    this.prisma.universityStudent.findMany({
      where,
      select: {
        id: true,
        universityId: true,
        fullName: true,
        email: true,
        major: {
          select: {
            id: true,
            name: true,
            faculty: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        account: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { fullName: 'asc' },
        { universityId: 'asc' },
      ],
      skip,
      take: limit,
    }),

    this.prisma.universityStudent.count({
      where,
    }),
  ]);

  return {
    data: students,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
}