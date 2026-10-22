import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ClubsController } from './clubs.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AccountRole } from '../../generated/prisma/client';

describe('ClubsController - Sprint 3.2 authorization', () => {
  const reflector = new Reflector();

  describe('Deanship listing', () => {
    it('requires the DEANSHIP role', () => {
      const roles = reflector.get(
        'roles',
        ClubsController.prototype.findAllForDeanship,
      );

      expect(roles).toEqual([AccountRole.DEANSHIP]);
    });

    it('uses JWT authentication and role guards', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ClubsController.prototype.findAllForDeanship,
      );

      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });
  });

  describe('Deanship club details', () => {
    it('requires the DEANSHIP role', () => {
      const roles = reflector.get(
        'roles',
        ClubsController.prototype.findOneForDeanship,
      );

      expect(roles).toEqual([AccountRole.DEANSHIP]);
    });

    it('uses JWT authentication and role guards', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ClubsController.prototype.findOneForDeanship,
      );

      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });
  });
  describe('Sprint 3.3 - Archive and activate authorization', () => {
  it.each(['archive', 'activate'] as const)(
    '%s requires the DEANSHIP role',
    (method) => {
      const roles = reflector.get(
        'roles',
        ClubsController.prototype[method],
      );

      expect(roles).toEqual([AccountRole.DEANSHIP]);
    },
  );

  it.each(['archive', 'activate'] as const)(
    '%s uses JWT authentication and role guards',
    (method) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ClubsController.prototype[method],
      );

      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    },
  );
});

describe('Sprint 3.4 - Supervisor assignment authorization', () => {
  it('requires the DEANSHIP role', () => {
    const roles = reflector.get(
      'roles',
      ClubsController.prototype.assignSupervisor,
    );

    expect(roles).toEqual([AccountRole.DEANSHIP]);
  });

  it('uses JWT authentication and role guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ClubsController.prototype.assignSupervisor,
    );

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });
});

});