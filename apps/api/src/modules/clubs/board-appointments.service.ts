import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, AccountStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ClubEligibilityService } from './club-eligibility.service';
import { CreateBoardAppointmentDto } from './dto/create-board-appointment.dto';
import { UpdateBoardAppointmentDto } from './dto/update-board-appointment.dto';

@Injectable()
export class BoardAppointmentsService {
  constructor(private readonly prisma: PrismaService, private readonly eligibility: ClubEligibilityService) {}

  private parseDay(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Date must use YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid calendar date.');
    return date;
  }
  private today(): Date { return this.parseDay(new Date().toISOString().slice(0, 10)); }
  private async assertClub(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true, status: true } });
    if (!club) throw new NotFoundException('Club not found.');
    if (club.status !== 'ACTIVE') throw new ConflictException('Club is archived.');
  }
  private async activeStudentAccount(studentId: string) {
    const student = await this.prisma.universityStudent.findUnique({
      where: { id: studentId },
      select: { id: true, account: { select: { id: true, role: true, status: true } } },
    });
    if (!student?.account || student.account.role !== AccountRole.STUDENT || student.account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Board members must have an active ClubHub student account.');
    }
    return student.account.id;
  }
  private async assertEligible(accountId: string, clubId: string) {
    const outcome = await this.eligibility.evaluateForAccount(accountId, clubId);
    if (!outcome.eligible) throw new BadRequestException(`Student is not eligible for this club: ${outcome.reason}`);
  }
  private readonly projection = {
    id: true, clubId: true, studentId: true, position: true, startDate: true, endDate: true, endedAt: true,
    student: { select: { universityId: true, fullName: true, email: true,
      account: { select: { profilePhotoUrl: true } },
      major: { select: { name: true, faculty: { select: { name: true } } } },
    } },
  } as const;

  async current(clubId: string) {
    await this.assertClub(clubId);
    const today = this.today();
    return this.prisma.boardAppointment.findMany({
      where: { clubId, endedAt: null, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
      select: this.projection, orderBy: [{ startDate: 'desc' }, { position: 'asc' }],
    });
  }
  async history(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found.');
    return this.prisma.boardAppointment.findMany({ where: { clubId }, select: this.projection, orderBy: [{ startDate: 'desc' }, { id: 'asc' }] });
  }
  async create(clubId: string, dto: CreateBoardAppointmentDto) {
    await this.assertClub(clubId);
    const accountId = await this.activeStudentAccount(dto.studentId);
    await this.assertEligible(accountId, clubId);
    const startDate = this.parseDay(dto.startDate);
    const endDate = dto.endDate ? this.parseDay(dto.endDate) : null;
    if (endDate && endDate < startDate) throw new BadRequestException('End date must be on or after start date.');
    const position = dto.position.trim();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${clubId}::uuid FOR UPDATE`;
      const others = await tx.boardAppointment.findMany({ where: { clubId }, select: { studentId: true, position: true, startDate: true, endDate: true, endedAt: true } });
      for (const old of others) {
        // A manually ended term stops blocking new appointments from the
        // termination day onward. Date-only start fields represent a new
        // appointment starting NOW if that day is today. Prior days still
        // overlap the historical term; the historical record remains intact.
        if (old.endedAt && startDate >= this.parseDay(old.endedAt.toISOString().slice(0, 10))) continue;
        const effectiveEnd = old.endedAt
          ? this.parseDay(old.endedAt.toISOString().slice(0, 10))
          : old.endDate;
        const overlaps = old.startDate <= (endDate ?? new Date('9999-12-31T00:00:00Z')) && (!effectiveEnd || effectiveEnd >= startDate);
        if (overlaps && (old.studentId === dto.studentId || (position.toLowerCase() === 'president' && old.position.trim().toLowerCase() === 'president'))) {
          throw new ConflictException('Overlapping board appointment or president term.');
        }
      }
      return tx.boardAppointment.create({ data: { clubId, studentId: dto.studentId, position, startDate, endDate }, select: this.projection });
    });
  }
  async update(id: string, dto: UpdateBoardAppointmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.boardAppointment.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Appointment not found.');
      await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${old.clubId}::uuid FOR UPDATE`;
      if (old.endedAt) throw new ConflictException('A manually ended appointment cannot be edited.');
      const position = dto.position === undefined ? old.position : dto.position.trim();
      const startDate = dto.startDate ? this.parseDay(dto.startDate) : old.startDate;
      const endDate = dto.endDate ? this.parseDay(dto.endDate) : old.endDate;
      if (endDate && endDate < startDate) throw new BadRequestException('End date must be on or after start date.');
      const others = await tx.boardAppointment.findMany({ where: { clubId: old.clubId, id: { not: id } }, select: { studentId: true, position: true, startDate: true, endDate: true, endedAt: true } });
      for (const item of others) {
        if (item.endedAt && startDate >= this.parseDay(item.endedAt.toISOString().slice(0, 10))) continue;
        const effectiveEnd = item.endedAt
          ? this.parseDay(item.endedAt.toISOString().slice(0, 10))
          : item.endDate;
        const overlaps = item.startDate <= (endDate ?? new Date('9999-12-31T00:00:00Z')) && (!effectiveEnd || effectiveEnd >= startDate);
        if (overlaps && (item.studentId === old.studentId || (position.toLowerCase() === 'president' && item.position.trim().toLowerCase() === 'president'))) throw new ConflictException('Overlapping board appointment or president term.');
      }
      const today = this.today();
      if (startDate > today || (endDate && endDate < today)) {
        const active = await tx.clubAdminAssignment.count({ where: { boardAppointmentId: id, revokedAt: null } });
        if (active) throw new ConflictException('Cannot move an administrator outside their board term. End the appointment first.');
      }
      return tx.boardAppointment.update({ where: { id }, data: { position, startDate, endDate }, select: this.projection });
    });
  }
  // End now: do not change the scheduled end date. Record the exact termination instant.
  // The legacy dateValue argument is accepted for backwards-compatible tests/callers; it is not used.
  async end(id: string, _dateValue: string, revokedById: string) {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.boardAppointment.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Appointment not found.');
      await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${old.clubId}::uuid FOR UPDATE`;
      const now = new Date();
      const today = this.today();
      if (old.endedAt || old.startDate > today || (old.endDate && old.endDate < today)) throw new ConflictException('Appointment already ended or not yet active.');
      await tx.clubAdminAssignment.updateMany({ where: { boardAppointmentId: id, revokedAt: null }, data: { revokedAt: now, revokedById } });
      return tx.boardAppointment.update({ where: { id }, data: { endedAt: now }, select: this.projection });
    });
  }
}