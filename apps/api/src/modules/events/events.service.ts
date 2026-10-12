import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: 'PUBLISHED',
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