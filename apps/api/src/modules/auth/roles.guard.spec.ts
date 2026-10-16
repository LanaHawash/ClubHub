import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
jest.mock('../../generated/prisma/client', () => ({
  AccountRole: {
    STUDENT: 'STUDENT',
    CLUB: 'CLUB',
    SUPERVISOR: 'SUPERVISOR',
    DEANSHIP: 'DEANSHIP',
  },
}), { virtual: true });
type TestRole = 'STUDENT' | 'CLUB' | 'SUPERVISOR' | 'DEANSHIP';

const AccountRole = {
  STUDENT: 'STUDENT',
  CLUB: 'CLUB',
  SUPERVISOR: 'SUPERVISOR',
  DEANSHIP: 'DEANSHIP',
} as const;
describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  function createContext(
   requiredRoles: TestRole[] | undefined,
   userRole?: TestRole,
  ): ExecutionContext {
    const handler = () => {};

    if (requiredRoles) {
      Reflect.defineMetadata(
        ROLES_KEY,
        requiredRoles,
        handler,
      );
    }

    return {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: userRole
            ? { id: 'test-account', role: userRole }
            : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access to unrestricted routes', () => {
    const context = createContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows Deanship to access Deanship-only routes', () => {
    const context = createContext(
      [AccountRole.DEANSHIP],
      AccountRole.DEANSHIP,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies students access to Deanship-only routes', () => {
    const context = createContext(
      [AccountRole.DEANSHIP],
      AccountRole.STUDENT,
    );

    expect(() => guard.canActivate(context))
      .toThrow(ForbiddenException);
  });

  it('denies unauthenticated access to restricted routes', () => {
    const context = createContext(
      [AccountRole.DEANSHIP],
    );

    expect(() => guard.canActivate(context))
      .toThrow(ForbiddenException);
  });

  it('allows students to access student-only routes', () => {
    const context = createContext(
      [AccountRole.STUDENT],
      AccountRole.STUDENT,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies Deanship access to student-only routes', () => {
    const context = createContext(
      [AccountRole.STUDENT],
      AccountRole.DEANSHIP,
    );

    expect(() => guard.canActivate(context))
      .toThrow(ForbiddenException);
  });
});