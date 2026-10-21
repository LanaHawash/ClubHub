import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { StudentsController } from './students.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AccountRole } from '../../generated/prisma/client';

describe('StudentsController - Sprint 2.4 Authorization', () => {
  const reflector = new Reflector();

  it('requires JWT authentication and role guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      StudentsController,
    );

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('restricts /students/me to STUDENT accounts', () => {
    const roles = reflector.get(
      'roles',
      StudentsController.prototype.getMyProfile,
    );

    expect(roles).toEqual([AccountRole.STUDENT]);
  });

  it('restricts student listing to DEANSHIP accounts', () => {
    const roles = reflector.get(
      'roles',
      StudentsController.prototype.getAllStudents,
    );

    expect(roles).toEqual([AccountRole.DEANSHIP]);
  });

  it('restricts student lookup to DEANSHIP accounts', () => {
    const roles = reflector.get(
      'roles',
      StudentsController.prototype.getStudentById,
    );

    expect(roles).toEqual([AccountRole.DEANSHIP]);
  });
});