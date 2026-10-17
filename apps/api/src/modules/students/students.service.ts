import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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
}