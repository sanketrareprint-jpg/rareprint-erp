/**
 * safeQuery — wraps any async Prisma (or other DB) call so a single
 * failing query never crashes the whole NestJS endpoint.
 *
 * Usage in a service method:
 *
 *   const orders = await safeQuery(
 *     () => this.prisma.order.findMany({ where: { status: 'PENDING' } }),
 *     'OrderService.getPending',
 *     [],          // fallback value returned on error (default: null)
 *   );
 *
 * The function:
 *  - Returns the query result on success
 *  - Returns `fallback` on ANY error (Prisma, network, type errors)
 *  - Logs the error with the caller label so Railway logs stay useful
 *  - Never throws — callers don't need try/catch
 *
 * For Promise.all patterns (virtual CEO, dashboard):
 *
 *   const [a, b, c] = await Promise.all([
 *     safeQuery(() => this.checkAccounts(), 'VirtualCeo.accounts', []),
 *     safeQuery(() => this.checkProduction(), 'VirtualCeo.production', []),
 *     safeQuery(() => this.checkDispatch(), 'VirtualCeo.dispatch', []),
 *   ]);
 */

import { Logger } from '@nestjs/common';

const log = new Logger('safeQuery');

export async function safeQuery<T>(
  fn: () => Promise<T>,
  label: string,
  fallback: T = null as unknown as T,
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error(`[${label}] query failed: ${msg}`, stack);
    return fallback;
  }
}
