// Sidebar categories — admin-only writes and input validation. If the gate
// tests fail, a non-admin can rearrange every user's sidebar.
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ErpConfigController } from './erp-config.controller';
import { ErpConfigService, normalizeNavGroups } from './erp-config.service';

function makeController() {
  const systemConfig = {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { systemConfig } as any;
  const controller = new ErpConfigController(new ErpConfigService(prisma), prisma);
  return { controller, systemConfig };
}

const req = (role: string) => ({ user: { id: 'u1', role, email: 'x@example.com' } });
const groups = [{ id: 'finance', label: 'Finance', hrefs: ['/accounts', '/billing'] }];

describe('PUT /erp-config/nav-groups admin gate', () => {
  it('lets an ADMIN save categories', async () => {
    const { controller, systemConfig } = makeController();
    await expect(controller.updateNavGroups(req('ADMIN'), { groups })).resolves.toEqual({ groups });
    expect(systemConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'sidebar_nav_groups' },
      update: { value: JSON.stringify(groups) },
    }));
  });

  it('lets an ADMIN reset to defaults', async () => {
    const { controller, systemConfig } = makeController();
    await expect(controller.updateNavGroups(req('ADMIN'), { groups: null })).resolves.toEqual({ groups: null });
    expect(systemConfig.deleteMany).toHaveBeenCalledWith({ where: { key: 'sidebar_nav_groups' } });
  });

  it.each(['SALES_AGENT', 'ACCOUNTS', 'PRODUCTION', 'DISPATCH', 'DESIGNER', 'INHOUSE'])('blocks %s', (role) => {
    const { controller, systemConfig } = makeController();
    expect(() => controller.updateNavGroups(req(role), { groups })).toThrow(ForbiddenException);
    expect(() => controller.updateNavGroups(req(role), { groups: null })).toThrow(ForbiddenException);
    expect(systemConfig.upsert).not.toHaveBeenCalled();
    expect(systemConfig.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks a request with no user', () => {
    const { controller } = makeController();
    expect(() => controller.updateNavGroups({}, { groups })).toThrow(ForbiddenException);
  });

  it('lets anyone read categories, defaulting to null', async () => {
    const { controller, systemConfig } = makeController();
    await expect(controller.getNavGroups()).resolves.toEqual({ groups: null });
    systemConfig.findUnique.mockResolvedValue({ key: 'sidebar_nav_groups', value: JSON.stringify(groups) });
    await expect(controller.getNavGroups()).resolves.toEqual({ groups });
  });
});

describe('normalizeNavGroups', () => {
  it('trims and keeps valid categories', () => {
    expect(normalizeNavGroups([{ id: ' hr ', label: '  HR  ', hrefs: ['/hr', '/admin/activity'] }, { id: 'empty', label: 'Empty', hrefs: [] }]))
      .toEqual([{ id: 'hr', label: 'HR', hrefs: ['/hr', '/admin/activity'] }, { id: 'empty', label: 'Empty', hrefs: [] }]);
  });

  it.each([
    ['not an array', { id: 'a' }],
    ['bad id', [{ id: 'Bad Id', label: 'X', hrefs: [] }]],
    ['duplicate id', [{ id: 'a', label: 'A', hrefs: [] }, { id: 'a', label: 'B', hrefs: [] }]],
    ['empty label', [{ id: 'a', label: '  ', hrefs: [] }]],
    ['long label', [{ id: 'a', label: 'x'.repeat(41), hrefs: [] }]],
    ['missing hrefs', [{ id: 'a', label: 'A' }]],
    ['external link', [{ id: 'a', label: 'A', hrefs: ['https://evil.example'] }]],
    ['protocol-relative link', [{ id: 'a', label: 'A', hrefs: ['//evil.example'] }]],
    ['link in two categories', [{ id: 'a', label: 'A', hrefs: ['/hr'] }, { id: 'b', label: 'B', hrefs: ['/hr'] }]],
  ])('rejects %s', (_name, input) => {
    expect(() => normalizeNavGroups(input)).toThrow(BadRequestException);
  });
});
