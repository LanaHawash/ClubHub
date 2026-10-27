import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountRole, AccountStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AssignClubAdminDto } from './dto/assign-club-admin.dto';

@Injectable()
export class ClubAdminAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Both scheduled dates are inclusive. Manual termination is immediate.
  private boardIsCurrent(startDate: Date, endDate: Date | null, endedAt: Date | null): boolean {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    return !endedAt && startDate <= today && (!endDate || endDate >= today);
  }

  private currentBoardWhere() {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    return {
      endedAt: null,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    };
  }

  private async assertActiveDeanship(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId }, select: { role: true, status: true },
    });
    if (!account || account.role !== AccountRole.DEANSHIP || account.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Only an active Deanship account can manage administrators.');
    }
  }

  private async assertActiveStudent(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, role: true, status: true, universityStudentId: true },
    });
    if (!account || account.role !== AccountRole.STUDENT || account.status !== AccountStatus.ACTIVE || !account.universityStudentId) {
      throw new ForbiddenException('Only active registered students can access club administration.');
    }
  }

  async assignAdmin(clubId: string, dto: AssignClubAdminDto, assignedById: string) {
    await this.assertActiveDeanship(assignedById);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${clubId}::uuid FOR UPDATE`;
      const club = await tx.club.findUnique({ where: { id: clubId }, select: { status: true } });
      if (!club) throw new NotFoundException('Club not found.');
      if (club.status !== 'ACTIVE') throw new BadRequestException('Archived clubs cannot receive administrators.');

      const appointment = await tx.boardAppointment.findUnique({
        where: { id: dto.boardAppointmentId },
        select: {
          id: true, clubId: true, startDate: true, endDate: true, endedAt: true,
          student: { select: { account: { select: { id: true, role: true, status: true } } } },
        },
      });
      const account = appointment?.student.account;
      if (!appointment || appointment.clubId !== clubId ||
          !this.boardIsCurrent(appointment.startDate, appointment.endDate, appointment.endedAt) ||
          !account || account.role !== AccountRole.STUDENT || account.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('Select a current board member with an active ClubHub student account.');
      }
      // Count only effective administrators. Expired terms no longer reserve a position.
      const active = await tx.clubAdminAssignment.findMany({
        where: { revokedAt: null, club: { status: 'ACTIVE' }, boardAppointment: { is: this.currentBoardWhere() } },
        select: { clubId: true, accountId: true, position: true },
      });
      if (active.some((item) => item.clubId === clubId && item.position === dto.position)) {
        throw new ConflictException('This club already has an administrator in that position.');
      }
      if (active.some((item) => item.accountId === account.id)) {
        throw new ConflictException('This student already has active club administrator access.');
      }
      if (active.filter((item) => item.clubId === clubId).length >= 2) {
        throw new ConflictException('Only two active administrators are allowed per club.');
      }
      return tx.clubAdminAssignment.create({
        data: { clubId, accountId: account.id, boardAppointmentId: appointment.id, position: dto.position, assignedById },
        select: { id: true, clubId: true, accountId: true, boardAppointmentId: true, position: true, assignedAt: true, revokedAt: true },
      });
    });
  }

  async revokeAdmin(clubId: string, assignmentId: string, revokedById: string) {
    await this.assertActiveDeanship(revokedById);
    const assignment = await this.prisma.clubAdminAssignment.findFirst({
      where: { id: assignmentId, clubId, revokedAt: null },
      select: { id: true, clubId: true, accountId: true, position: true },
    });
    if (!assignment) throw new NotFoundException('Active administrator assignment not found.');
    const revoked = await this.prisma.clubAdminAssignment.updateMany({
      where: { id: assignmentId, clubId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById },
    });
    if (revoked.count !== 1) throw new ConflictException('This administrator assignment has already been revoked.');
    return {
      message: 'Administrator access revoked successfully.',
      assignmentId, clubId, accountId: assignment.accountId, position: assignment.position,
    };
  }

  async getMyAdminAssignments(accountId: string) {
    await this.assertActiveStudent(accountId);
    return this.prisma.clubAdminAssignment.findMany({
      where: {
        accountId, revokedAt: null, club: { status: 'ACTIVE' },
        boardAppointment: { is: this.currentBoardWhere() },
      },
      select: {
        id: true, clubId: true, position: true, assignedAt: true,
        club: { select: { id: true, name: true, logoUrl: true, classification: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }

  async assertCanManageClub(clubId: string, accountId: string) {
    await this.assertActiveStudent(accountId);
    const assignment = await this.prisma.clubAdminAssignment.findFirst({
      where: {
        clubId, accountId, revokedAt: null, club: { status: 'ACTIVE' },
        boardAppointment: { is: this.currentBoardWhere() },
      },
      select: { id: true, position: true },
    });
    if (!assignment) throw new ForbiddenException('You do not have administrative access to this club.');
    return assignment;
  }

  async getClubAdminOverview(clubId: string, accountId: string) {
    const assignment = await this.assertCanManageClub(clubId, accountId);
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true, name: true, description: true, logoUrl: true, classification: true,
        status: true, foundedYear: true, contactEmail: true, meetingInfo: true,
        createdAt: true, updatedAt: true,
        supervisor: { select: { id: true } },
      },
    });
    if (!club) throw new NotFoundException('Club not found.');
    return { club, administrator: { assignmentId: assignment.id, position: assignment.position } };
  }

  async getClubAdminAssignments(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found.');
    return this.prisma.clubAdminAssignment.findMany({
      where: {
        clubId, revokedAt: null,
        boardAppointment: { is: this.currentBoardWhere() },
      },
      select: {
        id: true, clubId: true, accountId: true, boardAppointmentId: true,
        position: true, assignedAt: true,
        account: {
          select: {
            id: true, email: true,
            universityStudent: { select: { fullName: true, universityId: true } },
          },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }
}
