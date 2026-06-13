// backend/src/paper-inventory/paper-inventory.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { PaperInventoryService } from './paper-inventory.service';
import { PaperUnit, SheetQuality } from '@prisma/client';
import { memoryStorage } from 'multer';

@Controller('paper-inventory')
@UseGuards(AuthGuard('jwt'))
export class PaperInventoryController {
  constructor(private readonly service: PaperInventoryService) {}

  // Upload invoice image and extract purchase items with AI.
  @Post('extract-invoice')
  @UseInterceptors(
    FileInterceptor('invoice', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  async extractInvoice(@UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      return {
        invoiceNumber: null,
        items: [],
        error: 'No file received - check Content-Type is multipart/form-data',
      };
    }

    const extracted = await this.service.extractInvoiceFromBuffer(file.buffer, file.mimetype);
    return extracted;
  }

  @Post('purchase-orders')
  createPO(
    @Body()
    body: {
      invoiceNumber?: string;
      invoiceImagePath?: string;
      supplierId?: string;
      notes?: string;
      items: Array<{
        paperName: string;
        gsm: number;
        quality: SheetQuality;
        sizeInches?: string;
        unit: PaperUnit;
        unitQuantity: number;
        sheetsPerUnit?: number;
        pressId: string;
      }>;
    },
  ) {
    return this.service.createPurchaseOrder(body);
  }

  @Get('purchase-orders')
  listPOs() {
    return this.service.listPurchaseOrders();
  }

  @Get('purchase-orders/:id')
  getPO(@Param('id') id: string) {
    return this.service.getPurchaseOrder(id);
  }

  @Patch('purchase-orders/:id')
  updatePO(
    @Param('id') id: string,
    @Body()
    body: {
      invoiceNumber?: string;
      supplierId?: string;
      notes?: string;
      items: Array<{
        paperName: string;
        gsm: number;
        quality: SheetQuality;
        sizeInches?: string;
        unit: PaperUnit;
        unitQuantity: number;
        sheetsPerUnit?: number;
        pressId: string;
      }>;
    },
  ) {
    return this.service.updatePurchaseOrder(id, body);
  }

  @Patch('purchase-orders/:id/verify')
  verifyPO(@Param('id') id: string) {
    return this.service.verifyPurchaseOrder(id);
  }

  @Get('statement')
  getStatement(@Query('pressId') pressId?: string) {
    return this.service.getPressStatement(pressId);
  }

  @Get('transactions')
  getTransactions(
    @Query('pressId') pressId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTransactions(pressId, limit ? parseInt(limit, 10) : 100);
  }

  @Get('presses')
  listPresses() {
    return this.service.listPresses();
  }

  @Get('vendors')
  listVendors() {
    return this.service.listAllVendors();
  }

  @Patch('vendors/:id/mark-press')
  markAsPress(
    @Param('id') id: string,
    @Body('isPress') isPress: boolean,
  ) {
    return this.service.markVendorAsPress(id, isPress);
  }

  // ── In-House Sticker Stock (12x18) ──────────────────────────────────────────

  @Get('inhouse-sticker/balance')
  getStickerBalance() {
    return this.service.getStickerStockBalance();
  }

  @Post('inhouse-sticker/add')
  addStickerStock(
    @Body() body: { sheets: number; notes?: string },
  ) {
    return this.service.addStickerStock(body.sheets, body.notes);
  }

  @Post('inhouse-sticker/use')
  useStickerStock(
    @Body() body: { sheets: number; referenceId?: string; notes?: string },
  ) {
    return this.service.useStickerStock(body.sheets, body.referenceId, body.notes);
  }

  @Post('inhouse-sticker/adjust')
  adjustStickerStock(
    @Body() body: { newBalance: number; notes?: string },
  ) {
    return this.service.adjustStickerStock(body.newBalance, body.notes);
  }

  @Get('inhouse-sticker/transactions')
  getStickerTransactions(@Query('limit') limit?: string) {
    return this.service.getStickerTransactions(limit ? parseInt(limit, 10) : 100);
  }
}
