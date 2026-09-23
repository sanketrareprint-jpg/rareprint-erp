// Suspends one customer's backend: every request to their instance is
// refused with "This account is suspended..." until activate-customer.js is
// run. Their database, environment and data are untouched. See
// lib/suspension.js for how it works and why it's a variable, not a stopped
// container.
//
// Usage:
//   node suspend-customer.js demo-test-co
//   node suspend-customer.js demo-test-co --reason "invoice overdue 30d"

import 'dotenv/config';
import os from 'node:os';
import { findCustomer, parseArgs, setCustomerSuspended } from './lib/suspension.js';

try {
  const { slug, reason } = parseArgs(process.argv, 'suspend-customer.js');
  const customer = findCustomer(slug);
  await setCustomerSuspended(customer, true, { reason, actor: os.userInfo().username });
} catch (e) {
  console.error(`[suspend-customer] ${e.message}`);
  process.exit(1);
}
