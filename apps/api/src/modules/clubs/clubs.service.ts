import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

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
}