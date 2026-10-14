// App branding — admin-only writes, input validation, and clearing back to
// the deployment default. If the gate tests fail, any signed-in user can
// rename the whole company's app or swap its logo.
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { ErpConfigService } from './erp-config.service';

function makeController(rows: { key: string; value: string }[] = []) {
  const systemConfig = {
    findMany: jest.fn().mockResolvedValue(rows),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { systemConfig } as any;
  return { controller: new BrandingController(new ErpConfigService(prisma)), systemConfig };
}

const req = (role: string) => ({ user: { id: 'u1', role, email: 'x@example.com' } });
const file = (mimetype: string, size: number) =>
  ({ mimetype, size, buffer: Buffer.alloc(size, 1) }) as unknown as Express.Multer.File;

describe('GET /branding', () => {
  it('returns nulls when nothing is set, so the frontend uses its default', async () => {
    const { controller } = makeController();
    await expect(controller.getBranding()).resolves.toEqual({ appName: null, logoUrl: null });
  });

  it('returns the saved name and logo', async () => {
    const { controller } = makeController([
      { key: 'app_branding_name', value: 'Sharma Printers' },
      { key: 'app_branding_logo', value: 'data:image/png;base64,AAAA' },
    ]);
    await expect(controller.getBranding()).resolves.toEqual({ appName: 'Sharma Printers', logoUrl: 'data:image/png;base64,AAAA' });
  });
});

describe('branding admin gate', () => {
  for (const role of ['SALES_AGENT', 'ACCOUNTS', 'PRODUCTION', 'DESIGNER']) {
    it(`refuses ${role} for name, logo upload and logo removal`, async () => {
      const { controller, systemConfig } = makeController();
      expect(() => controller.setName(req(role), { appName: 'X' })).toThrow(ForbiddenException);
      expect(() => controller.setLogo(req(role), file('image/png', 10))).toThrow(ForbiddenException);
      expect(() => controller.clearLogo(req(role))).toThrow(ForbiddenException);
      expect(systemConfig.upsert).not.toHaveBeenCalled();
      expect(systemConfig.deleteMany).not.toHaveBeenCalled();
    });
  }

  it('lets an ADMIN save a trimmed name', async () => {
    const { controller, systemConfig } = makeController();
    await controller.setName(req('ADMIN'), { appName: '  Sharma Printers  ' });
    expect(systemConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'app_branding_name' },
      create: { key: 'app_branding_name', value: 'Sharma Printers' },
    }));
  });
});

describe('branding validation', () => {
  it('clears the name (back to default) when blank or null', async () => {
    for (const appName of ['   ', null]) {
      const { controller, systemConfig } = makeController();
      await controller.setName(req('ADMIN'), { appName });
      expect(systemConfig.deleteMany).toHaveBeenCalledWith({ where: { key: 'app_branding_name' } });
      expect(systemConfig.upsert).not.toHaveBeenCalled();
    }
  });

  it('rejects a name over 60 characters or not text', async () => {
    const { controller } = makeController();
    await expect(controller.setName(req('ADMIN'), { appName: 'x'.repeat(61) })).rejects.toThrow(BadRequestException);
    await expect(controller.setName(req('ADMIN'), { appName: 42 })).rejects.toThrow(BadRequestException);
  });

  it('stores an allowed logo as a data URL', async () => {
    const { controller, systemConfig } = makeController();
    await controller.setLogo(req('ADMIN'), file('image/webp', 3));
    expect(systemConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { key: 'app_branding_logo', value: `data:image/webp;base64,${Buffer.alloc(3, 1).toString('base64')}` },
    }));
  });

  it('rejects SVG / other types and logos over 300 KB', async () => {
    const { controller, systemConfig } = makeController();
    await expect(controller.setLogo(req('ADMIN'), file('image/svg+xml', 10))).rejects.toThrow(BadRequestException);
    await expect(controller.setLogo(req('ADMIN'), file('image/png', 300 * 1024 + 1))).rejects.toThrow(BadRequestException);
    expect(systemConfig.upsert).not.toHaveBeenCalled();
  });

  it('does not clear the logo when the upload has no file', () => {
    const { controller, systemConfig } = makeController();
    expect(() => controller.setLogo(req('ADMIN'), undefined as any)).toThrow(BadRequestException);
    expect(systemConfig.deleteMany).not.toHaveBeenCalled();
  });

  it('removes the logo on DELETE', async () => {
    const { controller, systemConfig } = makeController();
    await controller.clearLogo(req('ADMIN'));
    expect(systemConfig.deleteMany).toHaveBeenCalledWith({ where: { key: 'app_branding_logo' } });
  });
});
