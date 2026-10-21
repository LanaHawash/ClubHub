import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';

import { StudentsService } from './students.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

describe('StudentsService - Sprint 2.4', () => {
  let service: StudentsService;

  const prismaMock = {
    universityStudent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const studentProfile = {
    id: 'student-1',
    universityId: '12345678',
    email: 'student@stu.najah.edu',
    fullName: 'Test Student',
    major: {
      id: 'major-1',
      name: 'Computer Engineering',
      faculty: {
        id: 'faculty-1',
        name: 'Engineering',
      },
    },
    account: {
      id: 'account-1',
      role: 'STUDENT',
      status: 'ACTIVE',
      profilePhotoUrl: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new StudentsService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('getMyProfile', () => {
    it('returns the profile linked to the authenticated account', async () => {
      prismaMock.universityStudent.findFirst.mockResolvedValue(
        studentProfile as never,
      );

      const result = await service.getMyProfile('account-1');

      expect(result).toEqual(studentProfile);

      expect(prismaMock.universityStudent.findFirst)
        .toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              account: {
                is: {
                  id: 'account-1',
                },
              },
            },
          }),
        );
    });

    it('returns 404 when the Student profile does not exist', async () => {
      prismaMock.universityStudent.findFirst.mockResolvedValue(
        null as never,
      );

      await expect(
        service.getMyProfile('missing-account'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});