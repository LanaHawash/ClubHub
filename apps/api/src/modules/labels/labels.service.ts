import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.label.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  private async ensureUniqueName(
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.label.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'A label with this name already exists.',
      );
    }
  }

  async create(name: string) {
    const normalizedName = this.normalizeName(name);

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      throw new ConflictException(
        'Label name must contain 2 to 80 characters.',
      );
    }

    await this.ensureUniqueName(normalizedName);

    try {
      return await this.prisma.label.create({
        data: { name: normalizedName },
        select: { id: true, name: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A label with this name already exists.',
        );
      }

      throw error;
    }
  }

  async update(id: string, name: string) {
    const normalizedName = this.normalizeName(name);

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      throw new ConflictException(
        'Label name must contain 2 to 80 characters.',
      );
    }

    await this.ensureUniqueName(normalizedName, id);

    try {
      return await this.prisma.label.update({
        where: { id },
        data: { name: normalizedName },
        select: { id: true, name: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Label not found.');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A label with this name already exists.',
        );
      }

      throw error;
    }
  }

  async remove(id: string) {
    const label = await this.prisma.label.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!label) {
      throw new NotFoundException('Label not found.');
    }

    const associationCount = await this.prisma.clubLabel.count({
      where: { labelId: id },
    });

    if (associationCount > 0) {
      throw new ConflictException(
        'This label is assigned to clubs. Remove its club associations before deleting it.',
      );
    }

    try {
      await this.prisma.label.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'This label is still assigned to a club.',
        );
      }

      throw error;
    }

    return { success: true };
  }
}