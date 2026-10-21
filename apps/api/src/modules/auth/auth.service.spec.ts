import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { hash } from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../shared/mail/mail.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService - Sprint 2 Registration', () => {
  let service: AuthService;

  const prismaMock = {
  universityStudent: {
    findUnique: jest.fn(),
  },
  emailVerification: {
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  account: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
 passwordResetToken: {
  create: jest.fn(),
  findUnique: jest.fn(),
  updateMany: jest.fn(),
},
refreshSession: {
  updateMany: jest.fn(),
   create: jest.fn(),
},
  $transaction: jest.fn(),
};

 const configMock = {
  getOrThrow: jest.fn().mockImplementation((key) => {
    if (key === 'VERIFICATION_CODE_SECRET') {
      return 'test-verification-secret';
    }

    if (key === 'REGISTRATION_TOKEN_SECRET') {
      return 'test-registration-secret';
    }

    throw new Error(`Unexpected configuration key: ${key}`);
  }),

  get: jest.fn().mockImplementation((key, defaultValue) => {
    if (key === 'FRONTEND_URL') {
      return 'http://localhost:5173';
    }

    return defaultValue;
  }),
};

 const mailMock = {
  sendVerificationCode: jest.fn(),
  sendPasswordResetLink: jest.fn(),
};

  const jwtMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  beforeEach(() => {
    
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
  (async (callback: (tx: typeof prismaMock) => Promise<unknown>) => {
    return callback(prismaMock);
  }) as never,
);

    service = new AuthService(
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
      mailMock as unknown as MailService,
      jwtMock as unknown as JwtService,
    );
  });

  describe('startRegistration', () => {
    it('rejects a university ID that does not exist', async () => {
      prismaMock.universityStudent.findUnique.mockResolvedValue(
        null as never,
      );

      await expect(
        service.startRegistration('99999999'),
      ).rejects.toThrow(NotFoundException);

      expect(mailMock.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('rejects a student who already has an account', async () => {
      prismaMock.universityStudent.findUnique.mockResolvedValue({
        id: 'student-1',
        email: 'student@stu.najah.edu',
        account: { id: 'account-1' },
      } as never);

      await expect(
        service.startRegistration('12345678'),
      ).rejects.toThrow(ConflictException);

      expect(mailMock.sendVerificationCode).not.toHaveBeenCalled();
    });
  });

  describe('verifyRegistration', () => {
    it('rejects an incorrect code and increments the attempt counter', async () => {
  const verification = {
    id: 'verification-1',
    codeHash: '0'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000),
    attemptCount: 0,
    usedAt: null,
  };

  prismaMock.emailVerification.findFirst.mockResolvedValue(
    verification as never,
  );

  prismaMock.emailVerification.updateMany.mockResolvedValue({
    count: 1,
  } as never);

  await expect(
    service.verifyRegistration('12345678', '123456'),
  ).rejects.toThrow(BadRequestException);

  expect(
    prismaMock.emailVerification.updateMany,
  ).toHaveBeenCalledWith({
    where: {
      id: 'verification-1',
      usedAt: null,
      attemptCount: { lt: 5 },
    },
    data: {
      attemptCount: { increment: 1 },
    },
  });

  expect(jwtMock.signAsync).not.toHaveBeenCalled();
});
  const student = {
    id: 'student-1',
    account: null,
  };

  beforeEach(() => {
    prismaMock.universityStudent.findUnique.mockResolvedValue(
      student as never,
    );
  });

  it('rejects an unknown university ID', async () => {
    prismaMock.universityStudent.findUnique.mockResolvedValue(
      null as never,
    );

    await expect(
      service.verifyRegistration('99999999', '123456'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an expired verification code', async () => {
    prismaMock.emailVerification.findFirst.mockResolvedValue({
      id: 'verification-1',
      expiresAt: new Date(Date.now() - 60_000),
      attemptCount: 0,
      usedAt: null,
    } as never);

    await expect(
      service.verifyRegistration('12345678', '123456'),
    ).rejects.toThrow(BadRequestException);

    expect(
      prismaMock.emailVerification.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('rejects a code after five incorrect attempts', async () => {
    prismaMock.emailVerification.findFirst.mockResolvedValue({
      id: 'verification-1',
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 5,
      usedAt: null,
    } as never);

    await expect(
      service.verifyRegistration('12345678', '123456'),
    ).rejects.toThrow(BadRequestException);

    expect(
      prismaMock.emailVerification.updateMany,
    ).not.toHaveBeenCalled();
  });
it('verifies a correct code and issues a registration token', async () => {
  const studentId = 'student-1';
  const code = '123456';
  const secret = 'test-verification-secret';

  const codeHash = createHmac('sha256', secret)
    .update(`${studentId}:${code}`)
    .digest('hex');

  prismaMock.emailVerification.findFirst.mockResolvedValue({
    id: 'verification-1',
    universityStudentId: studentId,
    codeHash,
    expiresAt: new Date(Date.now() + 60_000),
    attemptCount: 0,
    usedAt: null,
  } as never);

  prismaMock.emailVerification.updateMany.mockResolvedValue({
    count: 1,
  } as never);

  jwtMock.signAsync.mockResolvedValue(
    'mock-registration-token' as never,
  );

  const result = await service.verifyRegistration(
    '12345678',
    code,
  );

  expect(prismaMock.emailVerification.updateMany)
    .toHaveBeenCalledWith({
      where: {
        id: 'verification-1',
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
        attemptCount: { lt: 5 },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });

  expect(jwtMock.signAsync).toHaveBeenCalledWith(
    {
      sub: studentId,
      purpose: 'complete-registration',
      verificationId: 'verification-1',
    },
    {
      secret: 'test-registration-secret',
      expiresIn: '10m',
    },
  );

  expect(result).toEqual({
    message: 'Email verified successfully',
    registrationToken: 'mock-registration-token',
  });
});
it('rejects a verification code that has already been used', async () => {
  prismaMock.emailVerification.findFirst.mockResolvedValue(
    null as never,
  );

  await expect(
    service.verifyRegistration('12345678', '123456'),
  ).rejects.toThrow(BadRequestException);

  expect(
    prismaMock.emailVerification.findFirst,
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        universityStudentId: 'student-1',
        usedAt: null,
      },
    }),
  );

  expect(
    prismaMock.emailVerification.updateMany,
  ).not.toHaveBeenCalled();

  expect(jwtMock.signAsync).not.toHaveBeenCalled();
});

});
describe('completeRegistration', () => {
  it('creates an active Student account after email verification', async () => {
    const student = {
      id: 'student-1',
      email: 'student@stu.najah.edu',
    };

    const account = {
      id: 'account-1',
      email: student.email,
      role: 'STUDENT',
      status: 'ACTIVE',
    };

    jwtMock.verifyAsync.mockResolvedValue({
      sub: student.id,
      purpose: 'complete-registration',
      verificationId: 'verification-1',
    } as never);

    prismaMock.emailVerification.findFirst.mockResolvedValue({
      id: 'verification-1',
      universityStudentId: student.id,
      usedAt: new Date(),
    } as never);

    prismaMock.universityStudent.findUnique.mockResolvedValue(
      student as never,
    );

    prismaMock.account.findUnique.mockResolvedValue(null as never);

    prismaMock.account.create.mockResolvedValue(account as never);

    const result = await service.completeRegistration(
      'valid-registration-token',
      'SecurePassword123!',
    );

    expect(jwtMock.verifyAsync).toHaveBeenCalledWith(
      'valid-registration-token',
      {
        secret: 'test-registration-secret',
      },
    );

    expect(prismaMock.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: student.email,
          role: 'STUDENT',
          status: 'ACTIVE',
          universityStudentId: student.id,
          passwordHash: expect.any(String),
        }),
      }),
    );

    const createCall = prismaMock.account.create.mock.calls[0][0] as {
      data: { passwordHash: string };
    };

    expect(createCall.data.passwordHash).not.toBe(
      'SecurePassword123!',
    );

    expect(result).toEqual({
      message: 'ClubHub account created successfully',
      account,
    });
  });
  it('rejects an invalid or expired registration token', async () => {
  jwtMock.verifyAsync.mockRejectedValue(
    new Error('jwt expired') as never,
  );

  await expect(
    service.completeRegistration(
      'expired-registration-token',
      'SecurePassword123!',
    ),
  ).rejects.toThrow(UnauthorizedException);

  expect(prismaMock.$transaction).not.toHaveBeenCalled();

  expect(prismaMock.account.create).not.toHaveBeenCalled();
});

it('prevents creating a duplicate Student account', async () => {
  const student = {
    id: 'student-1',
    email: 'student@stu.najah.edu',
  };

  jwtMock.verifyAsync.mockResolvedValue({
    sub: student.id,
    purpose: 'complete-registration',
    verificationId: 'verification-1',
  } as never);

  prismaMock.emailVerification.findFirst.mockResolvedValue({
    id: 'verification-1',
    universityStudentId: student.id,
    usedAt: new Date(),
  } as never);

  prismaMock.universityStudent.findUnique.mockResolvedValue(
    student as never,
  );

  prismaMock.account.findUnique.mockResolvedValue({
    id: 'existing-account-1',
    universityStudentId: student.id,
  } as never);

  await expect(
    service.completeRegistration(
      'valid-registration-token',
      'SecurePassword123!',
    ),
  ).rejects.toThrow(ConflictException);

  expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
    where: {
      universityStudentId: student.id,
    },
  });

  expect(prismaMock.account.create).not.toHaveBeenCalled();
});
});
describe('forgotPassword', () => {
  it('does not reveal whether an email exists', async () => {
    prismaMock.account.findUnique.mockResolvedValue(null as never);

    const result = await service.forgotPassword(
      'unknown@stu.najah.edu',
    );

    expect(result.message).toBe(
      'If a ClubHub account exists for this email, a password reset link will be sent.',
    );

    expect(prismaMock.passwordResetToken.create)
      .not.toHaveBeenCalled();

    expect(mailMock.sendPasswordResetLink)
      .not.toHaveBeenCalled();
  });

  it('creates a reset token and sends an email for an active account', async () => {
    const account = {
      id: 'account-1',
      email: 'student@stu.najah.edu',
      status: 'ACTIVE',
    };

    prismaMock.account.findUnique.mockResolvedValue(
      account as never,
    );

    prismaMock.passwordResetToken.create.mockResolvedValue(
      {} as never,
    );

    const result = await service.forgotPassword(
      ' STUDENT@STU.NAJAH.EDU ',
    );

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'student@stu.najah.edu',
      },
    });

    expect(prismaMock.passwordResetToken.create)
      .toHaveBeenCalledWith({
        data: {
          accountId: account.id,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });

    expect(mailMock.sendPasswordResetLink)
      .toHaveBeenCalledWith(
        account.email,
        expect.stringContaining('resetToken='),
      );

    expect(result.message).toBe(
      'If a ClubHub account exists for this email, a password reset link will be sent.',
    );
  });
});
describe('resetPassword', () => {
  it('rejects an expired reset token without changing the password', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-token-1',
      accountId: 'account-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    } as never);

    await expect(
      service.resetPassword(
        'expired-token',
        'NewSecurePassword123!',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.passwordResetToken.updateMany)
      .not.toHaveBeenCalled();

    expect(prismaMock.account.update)
      .not.toHaveBeenCalled();
  });
  it('rejects an already-used reset token', async () => {
  prismaMock.passwordResetToken.findUnique.mockResolvedValue({
    id: 'reset-token-1',
    accountId: 'account-1',
    usedAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
  } as never);

  await expect(
    service.resetPassword(
      'already-used-token',
      'NewSecurePassword123!',
    ),
  ).rejects.toThrow(BadRequestException);

  expect(prismaMock.passwordResetToken.updateMany)
    .not.toHaveBeenCalled();

  expect(prismaMock.account.update)
    .not.toHaveBeenCalled();
});
it('successfully resets a password and revokes existing sessions', async () => {
  const accountId = 'account-1';

  prismaMock.passwordResetToken.findUnique.mockResolvedValue({
    id: 'reset-token-1',
    accountId,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  } as never);

  prismaMock.passwordResetToken.updateMany.mockResolvedValue({
    count: 1,
  } as never);

  prismaMock.account.update.mockResolvedValue({} as never);

  prismaMock.refreshSession.updateMany.mockResolvedValue({
    count: 2,
  } as never);

  const result = await service.resetPassword(
    'valid-reset-token',
    'NewSecurePassword123!',
  );

  // The reset token must be consumed.
  expect(prismaMock.passwordResetToken.updateMany)
    .toHaveBeenCalledWith({
      where: {
        id: 'reset-token-1',
        usedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });

  // The account password must be updated.
  expect(prismaMock.account.update).toHaveBeenCalledWith({
    where: {
      id: accountId,
    },
    data: {
      passwordHash: expect.any(String),
    },
  });

  // The new password must not be stored as plaintext.
  const updateCall = prismaMock.account.update.mock.calls[0][0] as {
    data: {
      passwordHash: string;
    };
  };

  expect(updateCall.data.passwordHash).not.toBe(
    'NewSecurePassword123!',
  );

  // Existing refresh sessions must be revoked.
  expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith({
    where: {
      accountId,
      revokedAt: null,
    },
    data: {
      revokedAt: expect.any(Date),
    },
  });

  // Other unused reset tokens must be invalidated.
  expect(prismaMock.passwordResetToken.updateMany)
    .toHaveBeenCalledWith({
      where: {
        accountId,
        usedAt: null,
      },
      data: {
        usedAt: expect.any(Date),
      },
    });

  expect(result).toEqual({
    message:
      'Your password has been reset successfully. You can now sign in.',
  });
});
});
describe('changePassword', () => {
  it('rejects an incorrect current password', async () => {
    const passwordHash = await hash('CorrectPassword123!', 4);

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
      passwordHash,
    } as never);

    await expect(
      service.changePassword(
        'account-1',
        'WrongPassword123!',
        'NewPassword123!',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.account.update).not.toHaveBeenCalled();

    expect(prismaMock.refreshSession.updateMany)
      .not.toHaveBeenCalled();

    expect(prismaMock.passwordResetToken.updateMany)
      .not.toHaveBeenCalled();
  });
  it('rejects using the same password again', async () => {
  const currentPassword = 'CurrentPassword123!';

  const passwordHash = await hash(currentPassword, 4);

  prismaMock.account.findUnique.mockResolvedValue({
    id: 'account-1',
    status: 'ACTIVE',
    passwordHash,
  } as never);

  await expect(
    service.changePassword(
      'account-1',
      currentPassword,
      currentPassword,
    ),
  ).rejects.toThrow(BadRequestException);

  expect(prismaMock.account.update).not.toHaveBeenCalled();

  expect(prismaMock.refreshSession.updateMany)
    .not.toHaveBeenCalled();

  expect(prismaMock.passwordResetToken.updateMany)
    .not.toHaveBeenCalled();
});
it('successfully changes the password and revokes sessions', async () => {
  const accountId = 'account-1';
  const currentPassword = 'CurrentPassword123!';
  const newPassword = 'NewSecurePassword123!';

  const passwordHash = await hash(currentPassword, 4);

  prismaMock.account.findUnique.mockResolvedValue({
    id: accountId,
    status: 'ACTIVE',
    passwordHash,
  } as never);

  prismaMock.account.update.mockResolvedValue({} as never);

  prismaMock.refreshSession.updateMany.mockResolvedValue({
    count: 2,
  } as never);

  prismaMock.passwordResetToken.updateMany.mockResolvedValue({
    count: 1,
  } as never);

  const result = await service.changePassword(
    accountId,
    currentPassword,
    newPassword,
  );

  // Verify that the password was updated.
  expect(prismaMock.account.update).toHaveBeenCalledWith({
    where: {
      id: accountId,
    },
    data: {
      passwordHash: expect.any(String),
    },
  });

  // Verify the new password is properly hashed.
  const updateCall = prismaMock.account.update.mock.calls[0][0] as {
    data: { passwordHash: string };
  };

  expect(updateCall.data.passwordHash).not.toBe(newPassword);

  // Verify that existing refresh sessions are revoked.
  expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith({
    where: {
      accountId,
      revokedAt: null,
    },
    data: {
      revokedAt: expect.any(Date),
    },
  });

  // Verify that unused reset tokens are invalidated.
  expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
    where: {
      accountId,
      usedAt: null,
    },
    data: {
      usedAt: expect.any(Date),
    },
  });

  expect(result).toEqual({
    message:
      'Your password has been changed successfully. Please sign in again.',
  });
});
});
describe('login - disabled accounts', () => {
  it('rejects a disabled Supervisor without issuing tokens', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'supervisor-account-1',
      email: 'supervisor@clubhub.local',
      role: 'SUPERVISOR',
      status: 'DISABLED',
      passwordHash: 'stored-password-hash',
    } as never);

    await expect(
      service.login(
        'supervisor@clubhub.local',
        'SupervisorPassword123!',
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'supervisor@clubhub.local',
      },
    });

    // No access token should be issued.
    expect(jwtMock.signAsync).not.toHaveBeenCalled();

    // No refresh session should be created.
    expect(prismaMock.refreshSession.create)
      .not.toHaveBeenCalled();
  });
});
});