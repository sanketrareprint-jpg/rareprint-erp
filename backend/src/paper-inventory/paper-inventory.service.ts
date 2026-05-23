// backend/src/paper-inventory/paper-inventory.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaperPOStatus, PaperTransactionType, PaperUnit, SheetQuality } from '@prisma/client';

// -- Constants -----------------------------------------------------------------
const SHEETS_PER_REAM = 500;

export function computeTotalSheets(unit: PaperUnit, unitQuantity: number, sheetsPerUnit: number): number {
  if (unit === PaperUnit.REAM) return Math.round(unitQuantity * SHEETS_PER_REAM);
  return Math.round(unitQuantity * sheetsPerUnit);
}

// -- DTOs ----------------------------------------------------------------------
export interface CreatePOItemDto {
  paperName: string;
  gsm: number;
  quality: SheetQuality;
  sizeInches?: string;
  unit: PaperUnit;
  unitQuantity: number;
  sheetsPerUnit?: number; // required if unit = PACKET
  pressId: string;
}

export interface CreatePODto {
  invoiceNumber?: string;
  invoiceImagePath?: string;
  supplierId?: string;
  notes?: string;
  items: CreatePOItemDto[];
}

@Injectable()
export class PaperInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // -- PO Number Generator -----------------------------------------------------
  private async generatePoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.paperPurchaseOrder.count();
    return `PPO-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // -- AI Invoice Extraction (accepts Buffer - works on Railway, no disk write) --
  async extractInvoiceFromBuffer(buffer: Buffer, mimeType: string): Promise<{
    invoiceNumber: string | null;
    items: Array<{
      paperName: string;
      gsm: number | null;
      quality: string | null;
      sizeInches: string | null;
      unit: string;
      unitQuantity: number | null;
      sheetsPerUnit: number | null;
    }>;
  }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not set - invoice AI extraction skipped');
      return { invoiceNumber: null, items: [] };
    }

    const imageData = buffer.toString('base64');

    const prompt = `You are reading a paper invoice from an Indian printing/stationery supplier.

Extract ALL paper/stationery items from this invoice image and return them as JSON.

For each line item extract:
- paperName: full description of the paper (e.g. "Maplitho 70 GSM 18x23", "Art Card 300 GSM")
- gsm: the GSM value as integer (e.g. 70, 90, 300). null if not found.
- quality: one of exactly these values: MAPLITHO, STICKER, BOND, ART_CARD, DUPLEX_CARD_WB, DUPLEX_CARD_GB. Guess from paper name. null if unclear.
- sizeInches: size like "18x23" or "23x36". null if not found.
- unit: "REAM" for regular paper reams, "PACKET" for art card packets
- unitQuantity: number of reams or packets as a decimal number. null if not found.
- sheetsPerUnit: sheets per packet (100, 125, 250 etc). Only for PACKET unit. null for REAMs.

Also extract:
- invoiceNumber: the invoice/bill number. null if not found.

Return ONLY valid JSON, no explanation:
{
  "invoiceNumber": "INV-12345" or null,
  "items": [
    {
      "paperName": "...",
      "gsm": 70,
      "quality": "MAPLITHO",
      "sizeInches": "18x23",
      "unit": "REAM",
      "unitQuantity": 10,
      "sheetsPerUnit": null
    }
  ]
}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: imageData,
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      });

      const data = await res.json() as { content?: Array<{ text?: string }> };
      const text = data?.content?.[0]?.text;
      if (!text) return { invoiceNumber: null, items: [] };

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { invoiceNumber: null, items: [] };
      return JSON.parse(jsonMatch[0]) as {
        invoiceNumber: string | null;
        items: Array<{
          paperName: string;
          gsm: number | null;
          quality: string | null;
          sizeInches: string | null;
          unit: string;
          unitQuantity: number | null;
          sheetsPerUnit: number | null;
        }>;
      };
    } catch (err) {
      console.error('Invoice AI extraction error:', err);
      return { invoiceNumber: null, items: [] };
    }
  }

  // -- Create Purchase Order --------------------------------------------------
  async createPurchaseOrder(dto: CreatePODto) {
    const poNumber = await this.generatePoNumber();

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.paperPurchaseOrder.create({
        data: {
          poNumber,
          invoiceNumber: dto.invoiceNumber,
          invoiceImagePath: dto.invoiceImagePath,
          supplierId: dto.supplierId ?? null,
          status: PaperPOStatus.RECEIVED, // auto-mark as received on creation
          notes: dto.notes,
        },
      });

      for (const item of dto.items) {
        const sheetsPerUnit = item.unit === PaperUnit.REAM
          ? SHEETS_PER_REAM
          : (item.sheetsPerUnit ?? 100);
        const totalSheets = computeTotalSheets(item.unit, item.unitQuantity, sheetsPerUnit);

        const poItem = await tx.paperPurchaseItem.create({
          data: {
            poId: po.id,
            paperName: item.paperName,
            gsm: item.gsm,
            quality: item.quality,
            sizeInches: item.sizeInches ?? null,
            unit: item.unit,
            unitQuantity: item.unitQuantity,
            sheetsPerUnit,
            totalSheets,
            pressId: item.pressId,
          },
        });

        // Update or create PaperInventory for this press + gsm + quality
        const existing = await tx.paperInventory.findUnique({
          where: { pressId_gsm_quality: { pressId: item.pressId, gsm: item.gsm, quality: item.quality } },
        });

        const newBalance = (existing?.balanceSheets ?? 0) + totalSheets;

        await tx.paperInventory.upsert({
          where: { pressId_gsm_quality: { pressId: item.pressId, gsm: item.gsm, quality: item.quality } },
          update: { balanceSheets: newBalance },
          create: { pressId: item.pressId, gsm: item.gsm, quality: item.quality, balanceSheets: totalSheets },
        });

        // Record transaction
        await tx.paperTransaction.create({
          data: {
            pressId: item.pressId,
            gsm: item.gsm,
            quality: item.quality,
            transactionType: PaperTransactionType.PURCHASE,
            sheets: totalSheets,
            balanceAfter: newBalance,
            referenceId: poItem.id,
            referenceType: 'PURCHASE',
            notes: `PO ${poNumber} - ${item.paperName}`,
            purchaseItemId: poItem.id,
          },
        });
      }

      return tx.paperPurchaseOrder.findUnique({
        where: { id: po.id },
        include: { items: { include: { press: true } }, supplier: true },
      });
    });
  }

  // -- Deduct paper when sheet goes to PRINTING -------------------------------
  async consumePaperForSheet(sheetId: string): Promise<void> {
    const sheet = await this.prisma.printSheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        sheetNo: true,
        gsm: true,
        quality: true,
        quantity: true,
        stageVendors: {
          where: { stage: 'PRINTING' },
          select: { vendorId: true },
        },
      },
    });

    if (!sheet) throw new NotFoundException('Sheet not found');

    const printingStageVendor = sheet.stageVendors[0];
    if (!printingStageVendor) {
      // No press assigned - skip paper check silently (press not yet assigned)
      return;
    }

    const pressId = printingStageVendor.vendorId;
    const { gsm, quality, quantity: sheetsNeeded } = sheet;

    // Check balance
    const inventory = await this.prisma.paperInventory.findUnique({
      where: { pressId_gsm_quality: { pressId, gsm, quality } },
    });

    const currentBalance = inventory?.balanceSheets ?? 0;

    if (currentBalance < sheetsNeeded) {
      const press = await this.prisma.vendor.findUnique({ where: { id: pressId }, select: { name: true } });
      throw new BadRequestException(
        `Insufficient paper at press "${press?.name ?? pressId}". ` +
        `Need ${sheetsNeeded} sheets of ${gsm} GSM ${quality.replace(/_/g, ' ')}, ` +
        `but only ${currentBalance} sheets available. ` +
        `Please purchase more paper and allocate it to this press before printing.`
      );
    }

    const newBalance = currentBalance - sheetsNeeded;

    await this.prisma.$transaction(async (tx) => {
      await tx.paperInventory.update({
        where: { pressId_gsm_quality: { pressId, gsm, quality } },
        data: { balanceSheets: newBalance },
      });

      await tx.paperTransaction.create({
        data: {
          pressId,
          gsm,
          quality,
          transactionType: PaperTransactionType.PRINTING_DEDUCTION,
          sheets: -sheetsNeeded,
          balanceAfter: newBalance,
          referenceId: sheetId,
          referenceType: 'PRINT_SHEET',
          notes: `Sheet ${sheet.sheetNo} sent to printing`,
        },
      });
    });
  }

  // -- Restore paper if sheet is moved BACK from PRINTING --------------------
  async restorePaperForSheet(sheetId: string): Promise<void> {
    // Find the most recent deduction for this sheet
    const lastDeduction = await this.prisma.paperTransaction.findFirst({
      where: {
        referenceId: sheetId,
        referenceType: 'PRINT_SHEET',
        transactionType: PaperTransactionType.PRINTING_DEDUCTION,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastDeduction) return; // no deduction recorded, nothing to restore

    const { pressId, gsm, quality, sheets } = lastDeduction; // sheets is negative
    const sheetsToRestore = Math.abs(sheets);

    const inventory = await this.prisma.paperInventory.findUnique({
      where: { pressId_gsm_quality: { pressId, gsm, quality } },
    });

    const newBalance = (inventory?.balanceSheets ?? 0) + sheetsToRestore;

    await this.prisma.$transaction(async (tx) => {
      await tx.paperInventory.upsert({
        where: { pressId_gsm_quality: { pressId, gsm, quality } },
        update: { balanceSheets: newBalance },
        create: { pressId, gsm, quality, balanceSheets: sheetsToRestore },
      });

      await tx.paperTransaction.create({
        data: {
          pressId,
          gsm,
          quality,
          transactionType: PaperTransactionType.ADJUSTMENT,
          sheets: sheetsToRestore,
          balanceAfter: newBalance,
          referenceId: sheetId,
          referenceType: 'PRINT_SHEET',
          notes: `Sheet reverted from PRINTING - paper restored`,
        },
      });
    });
  }

  // -- List Purchase Orders ---------------------------------------------------
  async listPurchaseOrders() {
    return this.prisma.paperPurchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        items: {
          include: { press: { select: { id: true, name: true } } },
        },
      },
    });
  }

  // -- Press-wise Statement ---------------------------------------------------
  async getPressStatement(pressId?: string) {
    const where = pressId ? { pressId } : undefined;

    const inventories = await this.prisma.paperInventory.findMany({
      where,
      include: { press: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ pressId: 'asc' }, { gsm: 'asc' }, { quality: 'asc' }],
    });

    // Group by press
    const byPress: Record<string, {
      pressId: string;
      pressName: string;
      pressPhone: string | null;
      items: Array<{ gsm: number; quality: string; balanceSheets: number; balanceReams: string }>;
      totalSheets: number;
    }> = {};

    for (const inv of inventories) {
      const pid = inv.pressId;
      if (!byPress[pid]) {
        byPress[pid] = {
          pressId: pid,
          pressName: inv.press.name,
          pressPhone: inv.press.phone ?? null,
          items: [],
          totalSheets: 0,
        };
      }
      const balanceReams = (inv.balanceSheets / SHEETS_PER_REAM).toFixed(2);
      byPress[pid].items.push({
        gsm: inv.gsm,
        quality: inv.quality,
        balanceSheets: inv.balanceSheets,
        balanceReams,
      });
      byPress[pid].totalSheets += inv.balanceSheets;
    }

    return Object.values(byPress);
  }

  // -- Transaction History ----------------------------------------------------
  async getTransactions(pressId?: string, limit = 100) {
    return this.prisma.paperTransaction.findMany({
      where: pressId ? { pressId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { press: { select: { id: true, name: true } } },
    });
  }

  // -- List Presses (vendors marked isPress = true) ---------------------------
  async listPresses() {
    return this.prisma.vendor.findMany({
      where: { isActive: true, isPress: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, isPress: true },
    });
  }

  // -- All active vendors (for press dropdown - user can use any vendor) ------
  async listAllVendors() {
    return this.prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, isPress: true },
    });
  }

  // -- Mark a vendor as a press -----------------------------------------------
  async markVendorAsPress(vendorId: string, isPress: boolean) {
    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: { isPress },
    });
  }

  // -- Get purchase order detail ----------------------------------------------
  async getPurchaseOrder(id: string) {
    const po = await this.prisma.paperPurchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { press: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  // -- Update Purchase Order (reverse old inventory, apply new) ---------------
  async updatePurchaseOrder(id: string, dto: CreatePODto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.paperPurchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Purchase order not found');

      // 1. Reverse inventory for each old item
      for (const oldItem of existing.items) {
        const inv = await tx.paperInventory.findUnique({
          where: { pressId_gsm_quality: { pressId: oldItem.pressId, gsm: oldItem.gsm, quality: oldItem.quality } },
        });
        const newBalance = Math.max(0, (inv?.balanceSheets ?? 0) - oldItem.totalSheets);
        if (inv) {
          await tx.paperInventory.update({
            where: { pressId_gsm_quality: { pressId: oldItem.pressId, gsm: oldItem.gsm, quality: oldItem.quality } },
            data: { balanceSheets: newBalance },
          });
        }
        await tx.paperTransaction.create({
          data: {
            pressId: oldItem.pressId,
            gsm: oldItem.gsm,
            quality: oldItem.quality,
            transactionType: PaperTransactionType.ADJUSTMENT,
            sheets: -oldItem.totalSheets,
            balanceAfter: newBalance,
            referenceId: id,
            referenceType: 'PO_EDIT_REVERSAL',
            notes: `PO ${existing.poNumber} edited — reversed old entry`,
          },
        });
      }

      // 2. Null out purchaseItemId on any transactions referencing these items
      //    (no onDelete:SetNull on the relation, so we must do this manually)
      const oldItemIds = existing.items.map((i) => i.id);
      if (oldItemIds.length > 0) {
        await tx.paperTransaction.updateMany({
          where: { purchaseItemId: { in: oldItemIds } },
          data: { purchaseItemId: null },
        });
      }

      // 3. Delete old items
      await tx.paperPurchaseItem.deleteMany({ where: { poId: id } });

      // 4. Update PO header
      await tx.paperPurchaseOrder.update({
        where: { id },
        data: {
          invoiceNumber: dto.invoiceNumber ?? null,
          supplierId: dto.supplierId ?? null,
          notes: dto.notes ?? null,
        },
      });

      // 5. Create new items and update inventory
      for (const item of dto.items) {
        const sheetsPerUnit = item.unit === PaperUnit.REAM
          ? SHEETS_PER_REAM
          : (item.sheetsPerUnit ?? 100);
        const totalSheets = computeTotalSheets(item.unit, item.unitQuantity, sheetsPerUnit);

        const poItem = await tx.paperPurchaseItem.create({
          data: {
            poId: id,
            paperName: item.paperName,
            gsm: item.gsm,
            quality: item.quality,
            sizeInches: item.sizeInches ?? null,
            unit: item.unit,
            unitQuantity: item.unitQuantity,
            sheetsPerUnit,
            totalSheets,
            pressId: item.pressId,
          },
        });

        const existingInv = await tx.paperInventory.findUnique({
          where: { pressId_gsm_quality: { pressId: item.pressId, gsm: item.gsm, quality: item.quality } },
        });
        const newBalance = (existingInv?.balanceSheets ?? 0) + totalSheets;

        await tx.paperInventory.upsert({
          where: { pressId_gsm_quality: { pressId: item.pressId, gsm: item.gsm, quality: item.quality } },
          update: { balanceSheets: newBalance },
          create: { pressId: item.pressId, gsm: item.gsm, quality: item.quality, balanceSheets: totalSheets },
        });

          data: {
            pressId: item.pressId,
            gsm: item.gsm,
            quality: item.quality,
            transactionType: PaperTransactionType.PURCHASE,
            sheets: totalSheets,
            balanceAfter: newBalance,
            referenceId: poItem.id,
            referenceType: 'PURCHASE',
            notes: `PO ${existing.poNumber} (edited) - ${item.paperName}`,
            purchaseItemId: poItem.id,
          },
        });
      }

      return tx.paperPurchaseOrder.findUnique({
        where: { id },
        include: { items: { include: { press: true } }, supplier: true },
      });
    });
  }
}
