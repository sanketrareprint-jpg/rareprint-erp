// Account creation is administrator-only, with one exception: the very first
// account on an instance that has no users yet, which is forced to ADMIN and
// signed in so a freshly provisioned customer can get started.
//
// These tests protect that gate. If they fail after a code change, either
// strangers can create accounts on every deployment, or a newly provisioned
// customer can no longer create their first administrator and their instance
// is unusable. Prisma and JWT signing are mocked — no database, no network.
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { SUPER_ADMIN_EMAIL } from '../common/super-admin';

type RequesterRow = { email: string; role: UserRole; isActive: boolean } | null;

function makeService(opts: { userCount: number; requester?: RequesterRow; tokenValid?: boolean }) {
  const created: any[] = [];
  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(opts.userCount),
      // First lookup resolves the requester (by id), the duplicate-email
      // check resolves by email — distinguished by which arg is present.
      findUnique: jest.fn().mockImplementation(({ where }: any) =>
        where.email !== undefined ? null : (opts.requester ?? null),
      ),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const row = { id: 'new-user-id', ...data };
        created.push(row);
        return row;
      }),
    },
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn().mockImplementation(async () => {
      if (opts.tokenValid === false) throw new Error('invalid signature');
      return { sub: 'requester-id', email: 'someone@example.com', role: 'ADMIN' };
    }),
  };
  const service = new AuthService(prisma as any, jwtService as any, {} as any);
  return { service, prisma, created };
}

const newAccount = ['New Person', 'new@example.com', 'password123'] as const;

describe('AuthService.register — bootstrap (no users exist yet)', () => {
  it('allows an unauthenticated call and forces the role to ADMIN', async () => {
    const { service, created } = makeService({ userCount: 0 });

    const result = await service.register(...newAccount, UserRole.SALES_AGENT);

    // The requested role is deliberately ignored, not honoured: a first user
    // who is not an admin could never create anyone else.
    expect(created[0].role).toBe(UserRole.ADMIN);
    expect(result.bootstrap).toBe(true);
    expect(result.user.role).toBe(UserRole.ADMIN);
  });

  it('signs the bootstrap administrator in', async () => {
    const { service } = makeService({ userCount: 0 });
    const result = await service.register(...newAccount);
    expect(result.accessToken).toBe('signed-token');
    expect(result.tokenType).toBe('Bearer');
  });
});

describe('AuthService.register — locked (users already exist)', () => {
  it('refuses an unauthenticated call', async () => {
    const { service, created } = makeService({ userCount: 1 });
    await expect(service.register(...newAccount)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(created).toHaveLength(0);
  });

  it('refuses a token that does not verify', async () => {
    const { service } = makeService({ userCount: 1, tokenValid: false });
    await expect(service.register(...newAccount, undefined, 'tampered')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a valid token belonging to a non-admin', async () => {
    const { service, created } = makeService({
      userCount: 1,
      requester: { email: 'agent@example.com', role: UserRole.SALES_AGENT, isActive: true },
    });
    await expect(service.register(...newAccount, undefined, 'good-token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('refuses a deactivated admin', async () => {
    const { service } = makeService({
      userCount: 1,
      requester: { email: 'ex-admin@example.com', role: UserRole.ADMIN, isActive: false },
    });
    await expect(service.register(...newAccount, undefined, 'good-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets an admin create a user with the requested role', async () => {
    const { service, created } = makeService({
      userCount: 1,
      requester: { email: 'admin@example.com', role: UserRole.ADMIN, isActive: true },
    });

    const result = await service.register(...newAccount, UserRole.DISPATCH, 'good-token');

    expect(created[0].role).toBe(UserRole.DISPATCH);
    expect(result.bootstrap).toBe(false);
  });

  it('lets an admin create another admin', async () => {
    const { service, created } = makeService({
      userCount: 1,
      requester: { email: 'admin@example.com', role: UserRole.ADMIN, isActive: true },
    });
    await service.register(...newAccount, UserRole.ADMIN, 'good-token');
    expect(created[0].role).toBe(UserRole.ADMIN);
  });

  it('lets the owner account create a user even without the ADMIN role', async () => {
    const { service, created } = makeService({
      userCount: 1,
      requester: { email: SUPER_ADMIN_EMAIL, role: UserRole.SALES_AGENT, isActive: true },
    });
    await service.register(...newAccount, UserRole.ACCOUNTS, 'good-token');
    expect(created[0].role).toBe(UserRole.ACCOUNTS);
  });

  it('matches the owner email case-insensitively', async () => {
    const { service, created } = makeService({
      userCount: 1,
      requester: { email: SUPER_ADMIN_EMAIL.toUpperCase(), role: UserRole.DESIGNER, isActive: true },
    });
    await service.register(...newAccount, UserRole.ACCOUNTS, 'good-token');
    expect(created).toHaveLength(1);
  });
});

// A customer's deployment sets OWNER_EMAIL to an empty string, meaning "no
// owner-by-email here". If an empty configured value ever matched, RarePrint's
// owner address — or worse, an account with a blank email — would hold owner
// rights over that customer's data.
describe('isOwnerEmail', () => {
  it('never matches when no owner email is configured', () => {
    jest.resetModules();
    const previous = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = '';
    try {
      // Re-imported so the module picks up the empty value at load time.
      const { isOwnerEmail: freshIsOwnerEmail } = require('../common/super-admin');
      expect(freshIsOwnerEmail('')).toBe(false);
      expect(freshIsOwnerEmail(null)).toBe(false);
      expect(freshIsOwnerEmail('sanket.rareprint@gmail.com')).toBe(false);
      expect(freshIsOwnerEmail('anyone@example.com')).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OWNER_EMAIL;
      else process.env.OWNER_EMAIL = previous;
      jest.resetModules();
    }
  });

  it('matches the configured owner when one is set', () => {
    jest.resetModules();
    const previous = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = 'boss@printco.in';
    try {
      const { isOwnerEmail: freshIsOwnerEmail } = require('../common/super-admin');
      expect(freshIsOwnerEmail('boss@printco.in')).toBe(true);
      expect(freshIsOwnerEmail('sanket.rareprint@gmail.com')).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OWNER_EMAIL;
      else process.env.OWNER_EMAIL = previous;
      jest.resetModules();
    }
  });

  it('does NOT return a token when an admin creates somebody else', async () => {
    // Returning one would replace the admin's own session with the new
    // user's the moment the frontend stored it.
    const { service } = makeService({
      userCount: 1,
      requester: { email: 'admin@example.com', role: UserRole.ADMIN, isActive: true },
    });
    const result = await service.register(...newAccount, UserRole.DESIGNER, 'good-token');
    expect(result.accessToken).toBeUndefined();
  });

  it('defaults to SALES_AGENT when an admin gives no role', async () => {
    const { service, created } = makeService({
      userCount: 1,
      requester: { email: 'admin@example.com', role: UserRole.ADMIN, isActive: true },
    });
    await service.register(...newAccount, undefined, 'good-token');
    expect(created[0].role).toBe(UserRole.SALES_AGENT);
  });
});
