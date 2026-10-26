import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AccountRole,
  AccountStatus,
  Prisma,
} from '../../generated/prisma/client';

import { PrismaService } from '../../shared/prisma/prisma.service';

import { AssignClubAdminDto } from './dto/assign-club-admin.dto';

@Injectable()
export class ClubAdminAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async assignAdmin(
    clubId: string,
    dto: AssignClubAdminDto,
    assignedById: string,
  ) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });

    if (!club) {
      throw new NotFoundException('Club not found.');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
      select: {
        id: true,
        role: true,
        status: true,
        universityStudentId: true,
      },
    });

    if (
      !account ||
      account.role !== AccountRole.STUDENT ||
      account.status !== AccountStatus.ACTIVE ||
      !account.universityStudentId
    ) {
      throw new BadRequestException(
        'Only active registered students can administer clubs.',
      );
    }

    const assigningAccount =
      await this.prisma.account.findUnique({
        where: { id: assignedById },
        select: {
          role: true,
          status: true,
        },
      });

    if (
      !assigningAccount ||
      assigningAccount.role !== AccountRole.DEANSHIP ||
      assigningAccount.status !== AccountStatus.ACTIVE
    ) {
      throw new BadRequestException(
        'Only an active Deanship account can assign administrators.',
      );
    }

    try {
      return await this.prisma.clubAdminAssignment.create({
        data: {
          clubId,
          accountId: dto.accountId,
          position: dto.position,
          assignedById,
        },
        select: {
          id: true,
          clubId: true,
          accountId: true,
          position: true,
          assignedAt: true,
          revokedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This administrative position or student assignment is already active.',
        );
      }

      throw error;
    }
  }
  async revokeAdmin(
  clubId: string,
  assignmentId: string,
  revokedById: string,
) {
  const revokingAccount = await this.prisma.account.findUnique({
    where: { id: revokedById },
    select: {
      role: true,
      status: true,
    },
  });

  if (
    !revokingAccount ||
    revokingAccount.role !== AccountRole.DEANSHIP ||
    revokingAccount.status !== AccountStatus.ACTIVE
  ) {
    throw new ForbiddenException(
      'Only an active Deanship account can revoke administrators.',
    );
  }

  const assignment = await this.prisma.clubAdminAssignment.findFirst({
    where: {
      id: assignmentId,
      clubId,
      revokedAt: null,
    },
    select: {
      id: true,
      clubId: true,
      accountId: true,
      position: true,
    },
  });

  if (!assignment) {
    throw new NotFoundException(
      'Active administrator assignment not found.',
    );
  }

  const revoked = await this.prisma.clubAdminAssignment.updateMany({
    where: {
      id: assignmentId,
      clubId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedById,
    },
  });

  if (revoked.count !== 1) {
    throw new ConflictException(
      'This administrator assignment has already been revoked.',
    );
  }

  return {
    message: 'Administrator access revoked successfully.',
    assignmentId,
    clubId,
    accountId: assignment.accountId,
    position: assignment.position,
  };
}
async getMyAdminAssignments(accountId: string) {
  const account = await this.prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      role: true,
      status: true,
      universityStudentId: true,
    },
  });

  if (
    !account ||
    account.role !== AccountRole.STUDENT ||
    account.status !== AccountStatus.ACTIVE ||
    !account.universityStudentId
  ) {
    throw new ForbiddenException(
      'Only active registered students can access club administration.',
    );
  }

  return this.prisma.clubAdminAssignment.findMany({
    where: {
      accountId,
      revokedAt: null,
      club: {
        status: 'ACTIVE',
      },
    },
    select: {
      id: true,
      clubId: true,
      position: true,
      assignedAt: true,
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
      assignedAt: 'asc',
    },
  });
}
async assertCanManageClub(
  clubId: string,
  accountId: string,
) {
  const account = await this.prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      role: true,
      status: true,
      universityStudentId: true,
    },
  });

  if (
    !account ||
    account.role !== AccountRole.STUDENT ||
    account.status !== AccountStatus.ACTIVE ||
    !account.universityStudentId
  ) {
    throw new ForbiddenException(
      'Only active registered students can manage clubs.',
    );
  }

  const assignment =
    await this.prisma.clubAdminAssignment.findFirst({
      where: {
        clubId,
        accountId,
        revokedAt: null,
        club: {
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        position: true,
      },
    });

  if (!assignment) {
    throw new ForbiddenException(
      'You do not have administrative access to this club.',
    );
  }

  return assignment;
}
async getClubAdminOverview(
  clubId: string,
  accountId: string,
) {
  const assignment = await this.assertCanManageClub(
    clubId,
    accountId,
  );

  const club = await this.prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      classification: true,
      status: true,
      foundedYear: true,
      contactEmail: true,
      meetingInfo: true,
      createdAt: true,
      updatedAt: true,
      supervisor: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!club) {
    throw new NotFoundException('Club not found.');
  }

  return {
    club,
    administrator: {
      assignmentId: assignment.id,
      position: assignment.position,
    },
  };
}
async getClubAdminAssignments(clubId: string) {
  const club = await this.prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true },
  });

  if (!club) {
    throw new NotFoundException('Club not found.');
  }

  return this.prisma.clubAdminAssignment.findMany({
    where: {
      clubId,
      revokedAt: null,
    },
    select: {
      id: true,
      clubId: true,
      accountId: true,
      position: true,
      assignedAt: true,
      account: {
        select: {
          id: true,
          email: true,
          universityStudent: {
            select: {
              fullName: true,
              universityId: true,
            },
          },
        },
      },
    },
    orderBy: {
      assignedAt: 'asc',
    },
  });
}
}