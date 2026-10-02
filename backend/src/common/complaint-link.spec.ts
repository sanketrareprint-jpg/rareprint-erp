import { complaintFormToken, complaintFormUrl, verifyComplaintFormToken } from './complaint-link';

describe('complaint form link', () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.JWT_SECRET = 'test-secret'; delete process.env.FRONTEND_ORIGIN; });
  afterAll(() => { process.env = env; });

  it('round-trips an order number, including TEST- orders', () => {
    expect(verifyComplaintFormToken(complaintFormToken('1542'))).toBe('1542');
    expect(verifyComplaintFormToken(complaintFormToken('TEST-1790768494775'))).toBe('TEST-1790768494775');
  });

  it('rejects a token edited to point at another order', () => {
    const [, sig] = complaintFormToken('1542').split('.');
    expect(verifyComplaintFormToken(`1543.${sig}`)).toBeNull();
  });

  it('rejects malformed tokens and other secrets', () => {
    expect(verifyComplaintFormToken('')).toBeNull();
    expect(verifyComplaintFormToken('1542')).toBeNull();
    expect(verifyComplaintFormToken('1542.short')).toBeNull();
    const token = complaintFormToken('1542');
    process.env.JWT_SECRET = 'another-secret';
    expect(verifyComplaintFormToken(token)).toBeNull();
  });

  it('builds the URL from the first FRONTEND_ORIGIN, defaulting to the live site', () => {
    expect(complaintFormUrl('1542')).toBe(`https://rareprint-erp.vercel.app/support?t=${complaintFormToken('1542')}`);
    process.env.FRONTEND_ORIGIN = 'https://erp.example.com/, https://other.example.com';
    expect(complaintFormUrl('1542')).toBe(`https://erp.example.com/support?t=${complaintFormToken('1542')}`);
  });
});
