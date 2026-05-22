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
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';

const INVOICE_DIR = join(process.cwd(), 'uploads', 'invoices');
function ensureInvoiceDir() {
  if (!existsSync(INVOICE_DIR)) mkdirSync(INVOICE_DIR, { recursive: true });
}

@Controller('paper-inventory')
@UseGuards(AuthGuard('jwt'))
export class PaperInventoryController {
  constructor(private readonly service: PaperInventoryService) {}

  // ── Upload invoice image + AI extract ─────────────────────────────────────
  @Post('extract-invoice')
  @UseInterceptors(
    FileInterceptor('invoice', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureInvoiceDir();
          cb(null, INVOICE_DIR);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `invoice-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  async extractInvoice(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { error: 'No file uploaded or unsupported type' };
    const extracted = await this.service.extractInvoiceFromImage(file.path, file.mimetype);
    return {
      invoiceImagePath: `uploads/invoices/${file.filename}`,
      invoiceImageFilename: file.filename,
      ...extracted,
    };
  }

  // ── Create Purchase Order ─────────────────────────────────────────────────
  @Post('purchase-orders')
  createPO(
    @Body() body: {
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

  // ── List Purchase Orders ──────────────────────────────────────────────────
  @Get('purchase-orders')
  listPOs() {
    return this.service.listPurchaseOrders();
  }

  // ── Get single PO ─────────────────────────────────────────────────────────
  @Get('purchase-orders/:id')
  getPO(@Param('id') id: string) {
    return this.service.getPurchaseOrder(id);
  }

  // ── Press-wise statement (all presses) ────────────────────────────────────
  @Get('statement')
  getStatement(@Query('pressId') pressId?: string) {
    return this.service.getPressStatement(pressId);
  }

  // ── Transaction history ───────────────────────────────────────────────────
  @Get('transactions')
  getTransactions(
    @Query('pressId') pressId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTransactions(pressId, limit ? parseInt(limit) : 100);
  }

  // ── List presses (vendors marked isPress=true) ────────────────────────────
  @Get('presses')
  listPresses() {
    return this.service.listPresses();
  }

  // ── List all vendors for press dropdown ───────────────────────────────────
  @Get('vendors')
  listVendors() {
    return this.service.listAllVendors();
  }

  // ── Mark/unmark vendor as press ──────────────────────────────────────────
  @Patch('vendors/:id/mark-press')
  markAsPress(
    @Param('id') id: string,
    @Body('isPress') isPress: boolean,
  ) {
    return this.service.markVendorAsPress(id, isPress);
  }

  // ── Serve invoice image ───────────────────────────────────────────────────
  @Get('invoice-image/:filename')
  async serveInvoiceImage(
    @Param('filename') filename: string,
  ) {
    // The actual serving is handled via the uploads static path — this just validates
    return { url: `/uploads/invoices/${filename}` };
  }
}
