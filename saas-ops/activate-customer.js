// Reverses suspend-customer.js: clears the suspension variable from the
// customer's backend and redeploys so their instance serves requests again.
// Safe to run on a customer that isn't suspended (it just re-checks and
// records status=active).
//
// Usage:
//   node activate-customer.js demo-test-co

import 'dotenv/config';
import os from 'node:os';
import { findCustomer, parseArgs, setCustomerSuspended } from './lib/suspension.js';

try {
  const { slug } = parseArgs(process.argv, 'activate-customer.js');
  const customer = findCustomer(slug);
  await setCustomerSuspended(customer, false, { actor: os.userInfo().username });
} catch (e) {
  console.error(`[activate-customer] ${e.message}`);
  process.exit(1);
}
