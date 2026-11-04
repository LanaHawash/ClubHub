import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private archivedClubVisibility(today: Date) {
    return {
      OR: [
        // Active clubs can display published events.
        {
          club: {
            status: 'ACTIVE' as const,
          },
        },

        // Archived clubs can display completed historical events.
        {
          AND: [
            {
              club: {
                status: 'ARCHIVED' as const,
              },
            },
            {
              OR: [
                {
                  endDate: {
                    lt: today,
                  },
                },
                {
                  endDate: null,
                  startDate: {
                    lt: today,
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  async findAll(period?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const todayUtc = new Date(`${today}T00:00:00.000Z`);

    const dateFilter =
      period === 'upcoming'
        ? { gte: todayUtc }
        : period === 'past'
          ? { lt: todayUtc }
          : undefined;

    return this.prisma.event.findMany({
      where: {
        status: 'PUBLISHED',

        ...(dateFilter ? { startDate: dateFilter } : {}),

        ...this.archivedClubVisibility(todayUtc),
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            classification: true,
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    const todayUtc = new Date(`${today}T00:00:00.000Z`);

    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: 'PUBLISHED',

        ...this.archivedClubVisibility(todayUtc),
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            classification: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }
}