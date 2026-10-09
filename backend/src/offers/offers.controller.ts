import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OffersService, type CreateOfferInput } from './offers.service';

@Controller('offers')
@UseGuards(AuthGuard('jwt'))
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  // Same admin check as CostTableController.assertAdmin — role-based, so it
  // works on every deployment (no owner-email dependency).
  private assertAdmin(req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin only');
    }
  }

  @Get()
  listAll(@Req() req: any) {
    this.assertAdmin(req);
    return this.offers.listAll();
  }

  // Any signed-in user — the Create Order offer dropdown.
  @Get('available')
  listAvailable() {
    return this.offers.listAvailable();
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateOfferInput) {
    this.assertAdmin(req);
    return this.offers.create(body);
  }

  @Patch(':id/active')
  setActive(@Req() req: any, @Param('id') id: string, @Body() body: { isActive?: boolean }) {
    this.assertAdmin(req);
    return this.offers.setActive(id, body.isActive === true);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    this.assertAdmin(req);
    return this.offers.remove(id);
  }

  // Any signed-in user — Create Order previews the locked offer prices.
  // The same pricing is re-run when the order is saved.
  @Post(':id/price')
  price(@Param('id') id: string, @Body() body: { items?: Array<{ productId: string; quantity: number }> }) {
    const items = Array.isArray(body?.items)
      ? body.items.map((i) => ({ productId: String(i?.productId ?? ''), quantity: Number(i?.quantity) }))
      : [];
    return this.offers.priceOffer(id, items);
  }
}
