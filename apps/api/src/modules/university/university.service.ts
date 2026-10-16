import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class UniversityService {
  constructor(private readonly prisma: PrismaService) {}

  findAllFaculties() {
    return this.prisma.faculty.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findAllMajors() {
    return this.prisma.major.findMany({
      include: {
        faculty: true,
      },
      orderBy: { name: 'asc' },
    });
  }
  findMajorsByFaculty(facultyId: string) {
  return this.prisma.major.findMany({
    where: {
      facultyId,
    },
    orderBy: {
      name: 'asc',
    },
  });
}
}