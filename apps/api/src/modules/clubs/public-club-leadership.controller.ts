import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** Public, display-only leadership projection; never exposes account IDs or emails. */
@Controller('clubs')
export class PublicClubLeadershipController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/leadership')
  async getLeadership(@Param('id', ParseUUIDPipe) id: string) {
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const club = await this.prisma.club.findFirst({
      where: { id, status: 'ACTIVE' },
      select: {
        id: true,
        supervisor: { select: { fullName: true } },
        boardAppointments: {
          where: {
            endedAt: null,
            startDate: { lte: today },
            OR: [{ endDate: null }, { endDate: { gte: today } }],
            student: { account: { is: { role: 'STUDENT', status: 'ACTIVE' } } },
          },
          orderBy: [{ startDate: 'asc' }, { position: 'asc' }],
          select: {
            id: true,
            position: true,
            student: {
              select: {
                fullName: true,
                account: { select: { profilePhotoUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!club) throw new NotFoundException('Club not found.');
    return {
      board: club.boardAppointments.map((item) => ({
        id: item.id,
        name: item.student.fullName,
        role: item.position,
        photo: item.student.account?.profilePhotoUrl ?? null,
      })),
      supervisor: club.supervisor?.fullName ?? null,
    };
  }
}