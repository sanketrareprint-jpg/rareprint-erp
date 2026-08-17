/**
 * check-bigship-live-status.js
 *
 * Read-only: logs into Bigship directly (same auth as bigship.service.ts
 * getOrderShipmentDetails) and prints the RAW live status for a given
 * bigshipOrderId (Shipment.bigshipOrderId, aka MasterCustomOrderId) —
 * bypassing whatever is cached in the ERP's database. Does not change
 * anything. Use this when the ERP's local status/bigshipStatus looks stale
 * or contradicts what you know actually happened with the shipment.
 *
 * HOW TO RUN (from your own machine, needs BIGSHIP_* creds in backend/.env):
 *   cd backend
 *   node scripts/check-bigship-live-status.js 519390424
 */

if (!process.env.BIGSHIP_USERNAME) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const axios = require('axios');
const BIGSHIP_BASE = 'https://api.bigship.direct';

async function main() {
  const masterCustomOrderId = process.argv[2];
  if (!masterCustomOrderId) {
    console.error('Usage: node scripts/check-bigship-live-status.js <bigshipOrderId>');
    process.exitCode = 1;
    return;
  }
  if (!process.env.BIGSHIP_USERNAME || !process.env.BIGSHIP_PASSWORD || !process.env.BIGSHIP_ACCESS_KEY) {
    console.error('BIGSHIP_USERNAME / BIGSHIP_PASSWORD / BIGSHIP_ACCESS_KEY not set in backend/.env');
    process.exitCode = 1;
    return;
  }

  const api = axios.create({ baseURL: BIGSHIP_BASE, timeout: 25_000 });

  const login = await api.post('/api/outbound/login', {
    username: process.env.BIGSHIP_USERNAME.trim(),
    password: process.env.BIGSHIP_PASSWORD.trim(),
    access_key: process.env.BIGSHIP_ACCESS_KEY.trim(),
  });
  const token = login.data?.data?.token;
  if (!token) {
    console.error('Login failed:', JSON.stringify(login.data));
    process.exitCode = 1;
    return;
  }

  const { data } = await api.request({
    method: 'get',
    url: '/api/outbound/order-shipment-details',
    data: { MasterCustomOrderId: masterCustomOrderId },
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log('Raw Bigship response:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e?.response?.data ?? e.message ?? e);
  process.exitCode = 1;
});
