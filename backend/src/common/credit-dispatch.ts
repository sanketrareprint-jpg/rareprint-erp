/**
 * Dispatch on credit (super admin only): no payment collected now; the unpaid
 * balance stays on the party's outstanding.
 *
 * Source of truth is the StatusLog row OrdersService.submitDispatchBatch
 * writes for the submission, tagged `metadata: { creditDispatch: true }`.
 * Accounts (Dispatch Approval + Outstanding) and the Dispatch queue all read
 * that flag -- never order.notes, which other screens can edit.
 */

/**
 * Human-readable payment line written into order.notes for a credit
 * submission (display/WhatsApp only). Must never contain "COD" --
 * dispatch.service.ts detects COD from notes with /\bCOD[:\s]/i.
 */
export const CREDIT_DISPATCH_NOTE = 'ON CREDIT (super admin approved) - balance to party outstanding';

export const CREDIT_DISPATCH_METADATA = { creditDispatch: true } as const;

/** True when a submission StatusLog's metadata marks it as a credit dispatch. */
export function isCreditDispatchLog(metadata: unknown): boolean {
  return !!metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).creditDispatch === true;
}
