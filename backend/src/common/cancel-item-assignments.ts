// backend/src/common/cancel-item-assignments.ts
//
// Order/item cancellation rules (Sanket, 2026-09-26): an item may only be
// cancelled while it is still "not printed", and once cancelled it must be
// removed from everywhere it was assigned in production.
//
// assertItemsCancellable — "not printed" means ALL of:
//   - itemProductionStage is still NOT_PRINTED;
//   - it is not on a print sheet that has started (sheet status PRINTING,
//     PROCESSING or COMPLETE — INCOMPLETE/SETTING are still just layouts);
//   - it has no vendor job work that has started or been paid (those involve
//     a vendor and money, so a person has to settle them first).
// Checked when a cancellation is requested AND again when Accounts approves
// it, because production can move on in between.
//
// releaseItemAssignments — for items being cancelled:
//   - removes them from print sheets and frees that sheet area (same as
//     ClubbingSheetService.removeItemFromSheet);
//   - deletes their PENDING, unpaid job work;
//   - clears their production category (In-house / Clubbing / Sheet).
import { BadRequestException } from '@nestjs/common';
import { JobWorkStatus, OrderProductionStage, Prisma, SheetStatus } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'orderItem' | 'printSheetItem' | 'printSheet' | 'jobWork'>;

const STARTED_SHEET_STATUSES: SheetStatus[] = [SheetStatus.PRINTING, SheetStatus.PROCESSING, SheetStatus.COMPLETE];

const STAGE_LABEL: Record<string, string> = {
  NOT_PRINTED: 'Not Printed',
  PRINTING: 'Printing',
  PROCESSING: 'Processing',
  READY_FOR_DISPATCH: 'Ready for Dispatch',
};

export async function assertItemsCancellable(db: Db, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const items = await db.orderItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      itemProductionStage: true,
      product: { select: { name: true } },
      sheetItems: { select: { sheet: { select: { sheetNo: true, status: true } } } },
      jobWorks: { select: { poNumber: true, status: true, isPaid: true } },
    },
  });

  const problems: string[] = [];
  for (const item of items) {
    const name = item.product?.name ?? 'Item';
    if (item.itemProductionStage !== OrderProductionStage.NOT_PRINTED) {
      problems.push(`${name} is already "${STAGE_LABEL[item.itemProductionStage] ?? item.itemProductionStage}"`);
      continue;
    }
    const startedSheet = item.sheetItems.find((si) => STARTED_SHEET_STATUSES.includes(si.sheet.status));
    if (startedSheet) {
      problems.push(`${name} is on sheet ${startedSheet.sheet.sheetNo}, which is already ${startedSheet.sheet.status.toLowerCase()}`);
      continue;
    }
    const activeJob = item.jobWorks.find((j) => j.status !== JobWorkStatus.PENDING || j.isPaid);
    if (activeJob) {
      problems.push(`${name} has vendor job work ${activeJob.poNumber ?? ''} that is ${activeJob.isPaid ? 'paid' : activeJob.status.toLowerCase().replace('_', ' ')}`.replace('  ', ' '));
    }
  }
  if (problems.length > 0) {
    throw new BadRequestException(
      `Can't cancel — only items that are not printed yet can be cancelled: ${problems.join('; ')}.`,
    );
  }
}

export async function releaseItemAssignments(db: Db, itemIds: string[]) {
  if (itemIds.length === 0) return { sheetsFreed: 0, jobWorksRemoved: 0 };

  const sheetItems = await db.printSheetItem.findMany({
    where: { orderItemId: { in: itemIds } },
    select: { id: true, sheetId: true, areaSqInches: true },
  });
  for (const si of sheetItems) {
    await db.printSheetItem.delete({ where: { id: si.id } });
    await db.printSheet.update({ where: { id: si.sheetId }, data: { usedAreaSqInches: { decrement: si.areaSqInches } } });
  }

  const removedJobs = await db.jobWork.deleteMany({
    where: { orderItemId: { in: itemIds }, status: JobWorkStatus.PENDING, isPaid: false },
  });

  await db.orderItem.updateMany({ where: { id: { in: itemIds } }, data: { productionCategory: null } });

  return { sheetsFreed: sheetItems.length, jobWorksRemoved: removedJobs.count };
}
