import type { Request, Response, NextFunction } from 'express';

/**
 * SaaS customer suspension switch (roadmap v3, Section 5).
 *
 * When a customer's own backend deployment has CUSTOMER_SUSPENDED=true in its
 * Railway variables (set/cleared by saas-ops/suspend-customer.js and
 * activate-customer.js), every request is refused with a clear message
 * instead of serving the app. The variable lives on the deployment, not in
 * code, so a suspended customer stays suspended across future pushes to
 * main — stopping the container instead would silently come back to life
 * on the next auto-deploy.
 *
 * /health is exempt so saas-ops/customer-status.js can still tell "suspended
 * but healthy" apart from "down". Nothing else is: login is refused too,
 * which is the point. Data is untouched — activating is just clearing the
 * variable and redeploying.
 *
 * On RarePrint's own production deployment this variable is never set, so
 * this is a no-op there.
 *
 * Responds 403 (not 503): the login page maps every 503 to "Database is
 * unavailable", which would hide the real reason from the customer.
 */
export const SUSPENDED_CUSTOMER_MESSAGE =
  'This account is suspended. Please contact RarePrint support to restore access.';

export function isCustomerSuspended(): boolean {
  return process.env.CUSTOMER_SUSPENDED === 'true';
}

export function suspendedCustomerMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isCustomerSuspended()) return next();
  if (req.path === '/health') return next();
  res.status(403).json({ statusCode: 403, message: SUSPENDED_CUSTOMER_MESSAGE });
}
