import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { ClubsService } from '../src/modules/clubs/clubs.service';
import { CreateClubDto } from '../src/modules/clubs/dto/create-club.dto';

describe('Sprint 5.B - PostgreSQL Membership Integration', () => {
  let prisma: PrismaService;
  let clubsService: ClubsService;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function makeDto(
    suffix: string,
    registrationMode: 'ALWAYS_OPEN' | 'WINDOWED' = 'ALWAYS_OPEN',
  ): CreateClubDto {
    const dto: CreateClubDto = {
      name: `S5 Integration ${suffix} ${runId}`,
      description: 'Isolated Sprint 5 membership integration test',
      contactEmail: `s5-${suffix}-${runId}@example.com`,
      classification: 'GENERAL',
      labelIds: [],
      newLabels: [],
      boardMembers: [],
      administrators: [],
      membership: {
        firstTimeFee: '30.00',
        renewalFee: '20.00',
        currency: 'ILS',
        registrationMode,
      },
    };

    if (registrationMode === 'WINDOWED') {
      dto.membership.opensAt = '2099-01-01T00:00:00.000Z';
      dto.membership.closesAt = '2099-02-01T00:00:00.000Z';
    }

    return dto;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;

    if (!url) {
      throw new Error(
        'DATABASE_URL must be explicitly configured for integration tests.',
      );
    }

    const databaseName = new URL(url).pathname.replace(/^\//, '');

    if (databaseName !== 'clubhub_test') {
      throw new Error(
        `Unsafe database: ${databaseName}. Integration tests require clubhub_test.`,
      );
    }

    prisma = new PrismaService();
    await prisma.$connect();

    clubsService = new ClubsService(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('persists an always-open club and effective fee version', async () => {
    const created = await clubsService.create(makeDto('always'));

    const settings = await prisma.clubMembershipSettings.findUnique({
      where: { clubId: created.id },
    });

    const versions = await prisma.clubMembershipFeeVersion.findMany({
      where: { clubId: created.id },
    });

    const windows = await prisma.clubRegistrationWindow.findMany({
      where: { clubId: created.id },
    });

    expect(settings).not.toBeNull();
    expect(settings?.registrationMode).toBe('ALWAYS_OPEN');
    expect(settings?.currency).toBe('ILS');
    expect(settings?.pendingFirstTimeFee.toString()).toBe('30');
    expect(settings?.pendingRenewalFee.toString()).toBe('20');

    expect(versions).toHaveLength(1);
    expect(versions[0].firstTimeFee.toString()).toBe('30');
    expect(versions[0].renewalFee.toString()).toBe('20');

    expect(windows).toHaveLength(0);
  });

  it('persists a windowed club without prematurely locking fees', async () => {
    const created = await clubsService.create(makeDto('window', 'WINDOWED'));

    const settings = await prisma.clubMembershipSettings.findUnique({
      where: { clubId: created.id },
    });

    const windows = await prisma.clubRegistrationWindow.findMany({
      where: { clubId: created.id },
    });

    const versions = await prisma.clubMembershipFeeVersion.findMany({
      where: { clubId: created.id },
    });

    expect(settings?.registrationMode).toBe('WINDOWED');

    expect(windows).toHaveLength(1);
    expect(windows[0].opensAt.toISOString()).toBe(
      '2099-01-01T00:00:00.000Z',
    );
    expect(windows[0].closesAt.toISOString()).toBe(
      '2099-02-01T00:00:00.000Z',
    );

    expect(windows[0].effectiveFeeVersionId).toBeNull();
    expect(versions).toHaveLength(0);
  });

it('rolls back club creation when a later operation fails', async () => {
  const dto = makeDto('rollback');

  // Deliberately provide duplicate board members.
  // The service detects this after creating the club
  // and membership records inside the transaction.
  dto.boardMembers = [
    {
      studentId: '00000000-0000-4000-8000-000000000001',
      position: 'President',
      startDate: '2026-11-01',
    },
    {
      studentId: '00000000-0000-4000-8000-000000000001',
      position: 'Vice President',
      startDate: '2026-11-01',
    },
  ];

  await expect(
    clubsService.create(dto),
  ).rejects.toThrow(BadRequestException);

  // PostgreSQL must roll back the club record.
  const club = await prisma.club.findFirst({
    where: { name: dto.name },
  });

  expect(club).toBeNull();
});

  it('rejects invalid fees without persisting a club', async () => {
    const dto = makeDto('invalid-fee');
    dto.membership.firstTimeFee = '-5.00';

    await expect(
      clubsService.create(dto),
    ).rejects.toThrow(BadRequestException);

    const club = await prisma.club.findFirst({
      where: { name: dto.name },
    });

    expect(club).toBeNull();
  });

  it('rejects a window referencing another club fee version', async () => {
    const first = await clubsService.create(makeDto('owner-a'));
    const second = await clubsService.create(makeDto('owner-b'));

    const firstVersion =
      await prisma.clubMembershipFeeVersion.findFirstOrThrow({
        where: { clubId: first.id },
      });

    await expect(
      prisma.clubRegistrationWindow.create({
        data: {
          clubId: second.id,
          opensAt: new Date('2099-03-01T00:00:00.000Z'),
          closesAt: new Date('2099-04-01T00:00:00.000Z'),
          effectiveFeeVersionId: firstVersion.id,
        },
      }),
    ).rejects.toThrow();

    const invalidWindows =
      await prisma.clubRegistrationWindow.count({
        where: {
          clubId: second.id,
          effectiveFeeVersionId: firstVersion.id,
        },
      });

    expect(invalidWindows).toBe(0);
  });

  it('rejects overlapping registration windows for the same club', async () => {
    const created = await clubsService.create(
      makeDto('overlap', 'WINDOWED'),
    );

    await expect(
      prisma.clubRegistrationWindow.create({
        data: {
          clubId: created.id,
          opensAt: new Date('2099-01-15T00:00:00.000Z'),
          closesAt: new Date('2099-02-15T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    const count = await prisma.clubRegistrationWindow.count({
      where: { clubId: created.id },
    });

    expect(count).toBe(1);
  });
});