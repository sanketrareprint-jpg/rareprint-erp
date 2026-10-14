// Outgoing brand text and RarePrint-only contacts (common/brand.ts).
// If the "RarePrint unchanged" tests fail, RarePrint's live WhatsApp/email
// wording has changed. If the customer tests fail, a SaaS customer's messages
// carry RarePrint's name — or RarePrint's phone/inbox receives their data.
import { brandName, brandTeamName, fallbackContactPhone, hrNotifyEmail, ownerWhatsappPhone, setBrandSettingsName } from './brand';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const KEYS = ['BRAND_NAME', 'OWNER_WHATSAPP_PHONE', 'FALLBACK_CONTACT_PHONE', 'HR_NOTIFY_EMAIL'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  setBrandSettingsName(null);
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setBrandSettingsName(null);
});

describe('RarePrint deployment (nothing set) is unchanged', () => {
  it('keeps the exact existing wording and contacts', () => {
    expect(brandName()).toBe('RarePrint');
    expect(brandTeamName()).toBe('Rareprint Team');
    expect(ownerWhatsappPhone()).toBe('919637318960');
    expect(fallbackContactPhone()).toBe('9637318960');
    expect(hrNotifyEmail()).toBe('hr.rareprint@gmail.com');
  });
});

describe('SaaS customer deployment', () => {
  beforeEach(() => {
    process.env.BRAND_NAME = 'Sharma Printers';
    process.env.OWNER_WHATSAPP_PHONE = '';
    process.env.FALLBACK_CONTACT_PHONE = '';
    process.env.HR_NOTIFY_EMAIL = '';
  });

  it('uses the approve-time name, never RarePrint', () => {
    expect(brandName()).toBe('Sharma Printers');
    expect(brandTeamName()).toBe('Sharma Printers Team');
  });

  it('a Settings name wins over the approve-time name', () => {
    setBrandSettingsName('  Sharma Packaging  ');
    expect(brandName()).toBe('Sharma Packaging');
    expect(brandTeamName()).toBe('Sharma Packaging Team');
  });

  it('has no RarePrint owner phone, contact phone or HR inbox', () => {
    expect(ownerWhatsappPhone()).toBe('');
    expect(fallbackContactPhone()).toBe('');
    expect(hrNotifyEmail()).toBe('');
  });

  it('uses its own contact phone when one was given at approve time', () => {
    process.env.FALLBACK_CONTACT_PHONE = '9876543210';
    expect(fallbackContactPhone()).toBe('9876543210');
  });
});

describe('order-created WhatsApp owner copy', () => {
  const orderParams = {
    customerName: 'Asha', customerPhone: '9000000001', orderNo: 'RP-1', productDetails: 'x',
    totalAmount: '1', advancePaid: '0', balanceDue: '1', agentName: 'Agent',
  };
  const destinationsSent = async () => {
    const service = new WhatsAppService();
    const post = jest.spyOn(service, 'postToAisensy').mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' } as any);
    await service.sendOrderCreated(orderParams);
    return post.mock.calls.map((call) => JSON.parse((call[0] as any).body).destination);
  };

  it('RarePrint still copies its owner', async () => {
    expect(await destinationsSent()).toEqual(['919637318960', '919000000001']);
  });

  it('a customer never copies RarePrint\'s owner', async () => {
    process.env.OWNER_WHATSAPP_PHONE = '';
    expect(await destinationsSent()).toEqual(['919000000001']);
  });
});
