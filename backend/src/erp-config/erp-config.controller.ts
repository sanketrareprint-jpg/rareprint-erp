import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErpConfigService, type ErpConfig } from './erp-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { isOrderOfferType } from '../offers/offer-rules';

@Controller('erp-config')
@UseGuards(AuthGuard('jwt'))
export class ErpConfigController {
  constructor(
    private readonly erpConfig: ErpConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getConfig() {
    return this.erpConfig.getConfig();
  }

  @Put()
  updateConfig(@Body() body: Partial<ErpConfig>) {
    return this.erpConfig.updateConfig(body);
  }

  // ── Offer Codes ────────────────────────────────────────────────────────────

  @Get('offer-codes')
  getOfferCodes() {
    return this.prisma.offerCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('offer-codes')
  createOfferCode(@Body() body: {
    code: string;
    description?: string;
    offerType?: string;
    discountAmount?: number;
    notes?: string;
    productIds: string[];
    validFrom?: string;
    validTo?: string;
  }) {
    if (isOrderOfferType(body.offerType)) {
      throw new BadRequestException('Create order-level offers from the Offers tab');
    }
    return this.prisma.offerCode.create({
      data: {
        code: body.code.toUpperCase().trim(),
        description: body.description,
        offerType: body.offerType ?? 'FREE_ITEM',
        discountAmount: body.discountAmount ?? null,
        notes: body.notes ?? null,
        productIds: body.productIds,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validTo: body.validTo ? new Date(body.validTo) : null,
      },
    });
  }

  @Patch('offer-codes/:id')
  async updateOfferCode(@Param('id') id: string, @Body() body: {
    isActive?: boolean;
    description?: string;
    offerType?: string;
    discountAmount?: number;
    notes?: string;
    productIds?: string[];
    validFrom?: string | null;
    validTo?: string | null;
  }) {
    await this.assertLegacyOfferCode(id, body.offerType);
    return this.prisma.offerCode.update({
      where: { id },
      data: {
        ...body,
        discountAmount: body.discountAmount !== undefined ? body.discountAmount : undefined,
        validFrom: body.validFrom !== undefined ? (body.validFrom ? new Date(body.validFrom) : null) : undefined,
        validTo: body.validTo !== undefined ? (body.validTo ? new Date(body.validTo) : null) : undefined,
      },
    });
  }

  @Delete('offer-codes/:id')
  async deleteOfferCode(@Param('id') id: string) {
    await this.assertLegacyOfferCode(id);
    return this.prisma.offerCode.delete({ where: { id } });
  }

  // These endpoints manage only the legacy per-item codes. Order-level offers
  // (DISCOUNT / FREE_ON_QTY / COMBO) price orders and set commission, so they
  // are managed only through the admin-gated /offers endpoints.
  private async assertLegacyOfferCode(id: string, newOfferType?: string) {
    const existing = await this.prisma.offerCode.findUnique({ where: { id }, select: { offerType: true } });
    if (isOrderOfferType(existing?.offerType) || isOrderOfferType(newOfferType)) {
      throw new BadRequestException('Manage order-level offers from the Offers tab');
    }
  }

  // ── Product Rules ──────────────────────────────────────────────────────────

  @Get('product-rules')
  getProductRules() {
    return this.prisma.productRule.findMany({ include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { createdAt: 'desc' } });
  }

  @Put('product-rules')
  upsertProductRule(@Body() body: { productId: string; minQty: number }) {
    return this.prisma.productRule.upsert({
      where: { productId: body.productId },
      create: { productId: body.productId, minQty: body.minQty },
      update: { minQty: body.minQty, isActive: true },
    });
  }

  @Delete('product-rules/:productId')
  deleteProductRule(@Param('productId') productId: string) {
    return this.prisma.productRule.delete({ where: { productId } });
  }
}
