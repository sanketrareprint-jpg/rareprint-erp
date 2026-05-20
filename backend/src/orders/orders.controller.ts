import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import type { Request, Response } from 'express';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

type JwtUser = { id: string };
type DesignFile = { filename: string; originalName: string; uploadedAt: string; size: number; base64?: string; mimeType?: string };

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'designs');

function ensureUploadsDir() {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
}

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.ordersService.findAllForTable({ page, limit, status, search });
  }

  @Get('ready-for-dispatch')
  @UseGuards(AuthGuard('jwt'))
  getReadyForDispatch(
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('search') search?: string,
  ) {
    return this.ordersService.getOrdersWithReadyItems({ page, limit, search });
  }

  @Get('payment-accounts')
  @UseGuards(AuthGuard('jwt'))
  getPaymentAccounts() {
    return this.ordersService.getPaymentAccounts();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: Request & { user: JwtUser }, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto, req.user.id);
  }

  @Post('submit-dispatch-batch')
  @UseGuards(AuthGuard('jwt'))
  submitDispatchBatch(
    @Req() req: Request & { user: JwtUser },
    @Body() body: {
      orderIds: string[];
      courierCharges: number;
      isCod: boolean;
      codAmount?: number;
      paymentMethod?: string;
      paymentAccountId?: string;
      paymentReference?: string;
      notes?: string;
      dispatchType?: string;
      transportName?: string;
      lrNumber?: string;
      transportChargesType?: string;
      transportBy?: string;
      awbNumber?: string;
      courierBy?: string;
      deliveryBoyName?: string;
      collectedByName?: string;
      collectedByPhone?: string;
    },
  ) {
    return this.ordersService.submitDispatchBatch(body.orderIds, req.user.id, body);
  }

  @Post(':id/payments')
  @UseGuards(AuthGuard('jwt'))
  addPayment(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
    @Body() body: {
      amount: number; method: string; paymentAccountId: string;
      referenceNumber?: string; notes?: string; paymentDate?: string;
    },
  ) {
    return this.ordersService.addPayment(id, req.user.id, body);
  }

  @Get(':id/payments')
  @UseGuards(AuthGuard('jwt'))
  getPayments(@Param('id') id: string) {
    return this.ordersService.getPayments(id);
  }

  @Get(':id/status-logs')
  @UseGuards(AuthGuard('jwt'))
  getStatusLogs(@Param('id') id: string) {
    return this.ordersService.getStatusLogs(id);
  }

  @Get(':id/items')
  @UseGuards(AuthGuard('jwt'))
  getOrderItems(@Param('id') id: string) {
    return this.ordersService.getOrderItems(id);
  }

  @Post(':id/submit-for-dispatch')
  @UseGuards(AuthGuard('jwt'))
  submitForDispatch(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
    @Body() body: {
      courierCharges: number; isCod: boolean;
      codAmount?: number; notes?: string;
    },
  ) {
    return this.ordersService.submitForDispatch(id, req.user.id, body);
  }


  @Get(":id/detail")
  @UseGuards(AuthGuard("jwt"))
  async getOrderDetail(@Param("id") id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: true } } },
    });
    if (!o) throw new Error("Order not found");
    return {
      id: o.id, orderNumber: o.orderNumber, status: o.status, notes: o.notes,
      customerName: o.customer.businessName, customerPhone: o.customer.phone,
      customerEmail: o.customer.email, customerAddress: o.customer.shippingAddress,
      items: o.items.map(i => ({
        id: i.id, productId: i.productId, productName: i.product.name,
        sizeInches: i.product.sizeInches, gsm: i.product.gsm, sides: i.product.sides,
        quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal),
        artworkNotes: i.artworkNotes,
      })),
    };
  }

  @Patch(":id/edit")
  @UseGuards(AuthGuard("jwt"))
  async editOrder(@Param("id") id: string, @Body() body: any, @Req() req: Request & { user: JwtUser }) {
    return this.ordersService.editOrder(id, body, req.user.id);
  }


  @Delete(":id")
  @UseGuards(AuthGuard("jwt"))
  async deleteOrder(@Param("id") id: string) {
    return this.ordersService.deleteOrder(id);
  }

  // ── Design Files ────────────────────────────────────────────────────────────

  /** GET /orders/items/:itemId/design-files — list all files for an item */
  @Get('items/:itemId/design-files')
  @UseGuards(AuthGuard('jwt'))
  async listDesignFiles(@Param('itemId') itemId: string) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) return [];
    const files: DesignFile[] = Array.isArray((item as any).designFiles)
      ? ((item as any).designFiles as DesignFile[])
      : [];
    return files.map(({ base64, ...file }) => file);
  }

  /** POST /orders/items/:itemId/design-files — upload a file */
  @Post('items/:itemId/design-files')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadDesignFile(
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new Error('No file received');
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('Order item not found');
    const existing: DesignFile[] = Array.isArray((item as any).designFiles) ? ((item as any).designFiles as DesignFile[]) : [];
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${extname(file.originalname)}`;
    ensureUploadsDir();
    const filePath = join(UPLOADS_DIR, unique);
    writeFileSync(filePath, file.buffer);
    const newFile: DesignFile = {
      filename: unique,
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      mimeType: file.mimetype,
    };
    await (this.prisma.orderItem as any).update({
      where: { id: itemId },
      data: { designFiles: [...existing.map(({ base64, ...file }) => file), newFile] },
    });
    return { success: true, file: { filename: newFile.filename, originalName: newFile.originalName, uploadedAt: newFile.uploadedAt, size: newFile.size } };
  }

  /** DELETE /orders/items/:itemId/design-files/:filename */
  @Delete('items/:itemId/design-files/:filename')
  @UseGuards(AuthGuard('jwt'))
  async deleteDesignFile(
    @Param('itemId') itemId: string,
    @Param('filename') filename: string,
  ) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('Order item not found');

    const existing: DesignFile[] = Array.isArray((item as any).designFiles)
      ? ((item as any).designFiles as DesignFile[])
      : [];

    const updated = existing.filter(f => f.filename !== filename);

    const filePath = join(UPLOADS_DIR, filename);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch {}
    }

    await (this.prisma.orderItem as any).update({
      where: { id: itemId },
      data: { designFiles: updated },
    });

    return { success: true };
  }

  /** GET /orders/items/:itemId/design-files/:filename — download a file */
  @Get('items/:itemId/design-files/:filename')
  @UseGuards(AuthGuard('jwt'))
  async downloadDesignFile(
    @Param('itemId') itemId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) { res.status(404).json({ message: 'Item not found' }); return; }
    const files: DesignFile[] = Array.isArray((item as any).designFiles) ? (item as any).designFiles : [];
    const file = files.find(f => f.filename === filename);
    if (!file) { res.status(404).json({ message: 'File not found' }); return; }
    if (file.base64 && file.mimeType) {
      const buffer = Buffer.from(file.base64, 'base64');
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
      return;
    }
    // Fallback to filesystem
    const filePath = join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) { res.status(404).json({ message: 'File not found' }); return; }
    res.download(filePath);
  }
}






