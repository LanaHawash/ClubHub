import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { hash, compare } from 'bcrypt';

import { PrismaService } from '../../shared/prisma/prisma.service';
import { MailService } from '../../shared/mail/mail.service';

import {
  AccountRole,
  AccountStatus,
} from '../../generated/prisma/client';
@Injectable()
export class AuthService {
  constructor(
  private readonly prisma: PrismaService,
  private readonly config: ConfigService,
  private readonly mail: MailService,
  private readonly jwt: JwtService,
) {}

  async findEligibleStudent(universityId: string) {
    const student = await this.prisma.universityStudent.findUnique({
      where: { universityId },
      select: {
        id: true,
        universityId: true,
        email: true,
        account: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!student || student.account) {
      return null;
    }

    return {
      id: student.id,
      email: student.email,
    };
  }
private hashVerificationCode(
  studentId: string,
  code: string,
): string {
  const secret = this.config.getOrThrow<string>(
    'VERIFICATION_CODE_SECRET',
  );

  return createHmac('sha256', secret)
    .update(`${studentId}:${code}`)
    .digest('hex');
}
async createVerificationCode(studentId: string) {
  const code = randomInt(100000, 1000000).toString();

  const codeHash = this.hashVerificationCode(
    studentId,
    code,
  );

  const expiresAt = new Date(
    Date.now() + 2 * 60 * 1000,
  );

  await this.prisma.emailVerification.create({
    data: {
      universityStudentId: studentId,
      codeHash,
      expiresAt,
      attemptCount: 0,
    },
  });

  return code;
}

async startRegistration(universityId: string) {
  const response = {
    message: 'If registration is available, a verification code will be sent.',
  };

  const student = await this.findEligibleStudent(universityId);

  if (!student) {
    return response;
  }

  const now = new Date();

  // Prevent repeated requests during the same 2-minute window.
  const recentCode = await this.prisma.emailVerification.findFirst({
    where: {
      universityStudentId: student.id,
      createdAt: {
        gte: new Date(now.getTime() - 2 * 60 * 1000),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (recentCode) {
    return response;
  }

  // Allow a maximum of 5 verification requests per student per hour.
  const requestsLastHour = await this.prisma.emailVerification.count({
    where: {
      universityStudentId: student.id,
      createdAt: {
        gte: new Date(now.getTime() - 60 * 60 * 1000),
      },
    },
  });

  if (requestsLastHour >= 5) {
    return response;
  }

  const code = await this.createVerificationCode(student.id);

  await this.mail.sendVerificationCode(student.email, code);

  return response;
}

async verifyRegistration(universityId: string, code: string) {
  const invalidCodeMessage = 'Invalid or expired verification code';

  const student = await this.prisma.universityStudent.findUnique({
    where: { universityId },
    select: {
      id: true,
      account: {
        select: { id: true },
      },
    },
  });

  if (!student || student.account) {
    throw new BadRequestException(invalidCodeMessage);
  }

  const verification = await this.prisma.emailVerification.findFirst({
    where: {
      universityStudentId: student.id,
      usedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (
    !verification ||
    verification.expiresAt <= new Date() ||
    verification.attemptCount >= 5
  ) {
    throw new BadRequestException(invalidCodeMessage);
  }

  const submittedHash = this.hashVerificationCode(student.id, code);

  const expectedBuffer = Buffer.from(verification.codeHash, 'hex');
  const submittedBuffer = Buffer.from(submittedHash, 'hex');

  const isValid =
    expectedBuffer.length === submittedBuffer.length &&
    timingSafeEqual(expectedBuffer, submittedBuffer);

  if (!isValid) {
    await this.prisma.emailVerification.updateMany({
      where: {
        id: verification.id,
        usedAt: null,
        attemptCount: { lt: 5 },
      },
      data: {
        attemptCount: { increment: 1 },
      },
    });

    throw new BadRequestException(invalidCodeMessage);
  }

  // Mark verification as used so this code cannot be reused.
  const result = await this.prisma.emailVerification.updateMany({
    where: {
      id: verification.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attemptCount: { lt: 5 },
    },
    data: {
      usedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new BadRequestException(invalidCodeMessage);
  }

  const registrationToken = await this.jwt.signAsync(
  {
    sub: student.id,
    purpose: 'complete-registration',
    verificationId: verification.id,
  },
  {
    secret: this.config.getOrThrow<string>(
      'REGISTRATION_TOKEN_SECRET',
    ),
    expiresIn: '10m',
  },
);

return {
  message: 'Email verified successfully',
  registrationToken,
};
}

async completeRegistration(
  registrationToken: string,
  password: string,
) {
  let payload: {
    sub: string;
    purpose: string;
    verificationId: string;
  };

  // 1. Validate the signed registration token.
  try {
    payload = await this.jwt.verifyAsync(registrationToken, {
      secret: this.config.getOrThrow<string>(
        'REGISTRATION_TOKEN_SECRET',
      ),
    });
  } catch {
    throw new UnauthorizedException(
      'Invalid or expired registration token',
    );
  }

  if (
    payload.purpose !== 'complete-registration' ||
    typeof payload.sub !== 'string' ||
    typeof payload.verificationId !== 'string'
  ) {
    throw new UnauthorizedException(
      'Invalid registration token',
    );
  }

  // 2. Hash the password before saving it.
  const passwordHash = await hash(password, 12);

  // 3. Create the account only if verification was successful.
  try {
    const account = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.emailVerification.findFirst({
        where: {
          id: payload.verificationId,
          universityStudentId: payload.sub,
          usedAt: { not: null },
        },
      });

      if (!verification) {
        throw new UnauthorizedException(
          'Email verification is required',
        );
      }

      const student = await tx.universityStudent.findUnique({
        where: { id: payload.sub },
      });

      if (!student) {
        throw new BadRequestException(
          'University student not found',
        );
      }

      const existingAccount = await tx.account.findUnique({
        where: {
          universityStudentId: student.id,
        },
      });

      if (existingAccount) {
        throw new ConflictException(
          'An account already exists for this student',
        );
      }

      return tx.account.create({
        data: {
          email: student.email,
          passwordHash,
          role: AccountRole.STUDENT,
          status: AccountStatus.ACTIVE,
          universityStudentId: student.id,
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
    });

    return {
      message: 'ClubHub account created successfully',
      account,
    };
  } catch (error) {
    if (
      error instanceof UnauthorizedException ||
      error instanceof BadRequestException ||
      error instanceof ConflictException
    ) {
      throw error;
    }

    // Handle duplicate accounts, including concurrent requests.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An account already exists',
      );
    }

    throw error;
  }
}
async login(email: string, password: string) {
  const invalidCredentials = new UnauthorizedException(
    'Invalid email or password',
  );

  const account = await this.prisma.account.findUnique({
    where: {
      email: email.trim().toLowerCase(),
    },
  });

  if (!account) {
    throw invalidCredentials;
  }

  if (account.status !== 'ACTIVE') {
    throw invalidCredentials;
  }

  const passwordMatches = await compare(
    password,
    account.passwordHash,
  );

  if (!passwordMatches) {
    throw invalidCredentials;
  }

  const accessToken = await this.jwt.signAsync(
    {
      sub: account.id,
      role: account.role,
      purpose: 'access',
    },
    {
      secret: this.config.getOrThrow<string>(
        'JWT_ACCESS_SECRET',
      ),
      expiresIn: '15m',
    },
  );

  return {
    message: 'Login successful',
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    account: {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
    },
  };
}

async getCurrentUser(accountId: string) {
  const account = await this.prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      profilePhotoUrl: true,
      universityStudent: {
        select: {
          universityId: true,
          fullName: true,
          major: {
            select: {
              id: true,
              name: true,
              faculty: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!account || account.status !== 'ACTIVE') {
    throw new UnauthorizedException('Account unavailable');
  }

  return account;
}

}