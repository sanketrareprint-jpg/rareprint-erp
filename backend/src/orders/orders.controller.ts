import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import type { Request, Response } from 'express';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

type JwtUser = { id: string };
type DesignFile = { filename: string; originalName: string; uploadedAt: string; size: number };

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
  findAll() {
    return this.ordersService.findAllForTable();
  }

  @Get('ready-for-dispatch')
  @UseGuards(AuthGuard('jwt'))
  getReadyForDispatch() {
    return this.ordersService.getOrdersWithReadyItems();
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
    return files;
  }

  /** POST /orders/items/:itemId/design-files — upload a file */
  @Post('items/:itemId/design-files')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureUploadsDir();
          cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|pdf|ai|psd|cdr|zip|svg|tiff|tif|eps|webp)$/i;
        if (allowed.test(extname(file.originalname))) {
          cb(null, true);
        } else {
          cb(new Error('File type not allowed'), false);
        }
      },
    }),
  )
  async uploadDesignFile(
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('Order item not found');

    const existing: DesignFile[] = Array.isArray((item as any).designFiles)
      ? ((item as any).designFiles as DesignFile[])
      : [];

    const newFile: DesignFile = {
      filename: file.filename,
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
      size: file.size,
    };

    await (this.prisma.orderItem as any).update({
      where: { id: itemId },
      data: { designFiles: [...existing, newFile] },
    });

    return { success: true, file: newFile };
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
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'File not found' });
      return;
    }
    res.download(filePath);
  }
}