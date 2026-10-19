import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AccountRole, AccountStatus } from '../../generated/prisma/client';

import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { UpdateSupervisorDto } from './dto/update-supervisor.dto';
function handlePrismaError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException('Email already registered');
  }

  throw error;
}
@Injectable()
export class SupervisorsService {
  constructor(private readonly prisma: PrismaService) {}

  // Create a supervisor account and profile together.
  async create(dto: CreateSupervisorDto) {
    const email = dto.email.trim().toLowerCase();

    const existingAccount = await this.prisma.account.findUnique({
      where: { email },
    });

    if (existingAccount) {
      throw new ConflictException('Email already registered');
    }

    const faculty = await this.prisma.faculty.findUnique({
      where: { id: dto.facultyId },
    });

    if (!faculty) {
      throw new BadRequestException('Faculty does not exist');
    }

    const passwordHash = await hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            email,
            passwordHash,
            role: AccountRole.SUPERVISOR,
            status: AccountStatus.ACTIVE,
          },
        });

        return tx.supervisorProfile.create({
          data: {
            fullName: dto.fullName.trim(),
            accountId: account.id,
            facultyId: dto.facultyId,
          },
          select: {
            id: true,
            fullName: true,
            facultyId: true,
            createdAt: true,
            account: {
              select: {
                id: true,
                email: true,
                role: true,
                status: true,
              },
            },
          },
        });
      });
    } catch (error) {
      handlePrismaError(error);
    }
  }

  // List all supervisors.
  async findAll() {
    return this.prisma.supervisorProfile.findMany({
      select: {
        id: true,
        fullName: true,
        faculty: {
          select: {
            id: true,
            name: true,
          },
        },
        account: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });
  }

  // Update supervisor information.
  async update(id: string, dto: UpdateSupervisorDto) {
    const supervisor = await this.prisma.supervisorProfile.findUnique({
      where: { id },
    });

    if (!supervisor) {
      throw new NotFoundException('Supervisor not found');
    }

    if (dto.facultyId) {
      const faculty = await this.prisma.faculty.findUnique({
        where: { id: dto.facultyId },
      });

      if (!faculty) {
        throw new BadRequestException('Faculty does not exist');
      }
    }

    const email = dto.email?.trim().toLowerCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (email !== undefined) {
          await tx.account.update({
            where: { id: supervisor.accountId },
            data: { email },
          });
        }

        return tx.supervisorProfile.update({
          where: { id },
          data: {
            ...(dto.fullName !== undefined && {
              fullName: dto.fullName.trim(),
            }),
            ...(dto.facultyId !== undefined && {
              facultyId: dto.facultyId,
            }),
          },
          select: {
            id: true,
            fullName: true,
            facultyId: true,
            account: {
              select: {
                email: true,
                status: true,
              },
            },
          },
        });
      });
    } catch (error) {
      handlePrismaError(error);
    }
  }

  // Activate or deactivate a supervisor.
  async updateStatus(id: string, status: AccountStatus) {
    const supervisor = await this.prisma.supervisorProfile.findUnique({
      where: { id },
    });

    if (!supervisor) {
      throw new NotFoundException('Supervisor not found');
    }

    return this.prisma.account.update({
      where: { id: supervisor.accountId },
      data: { status },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
      },
    });
  }
}
