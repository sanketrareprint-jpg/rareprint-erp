import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CustomerDirectoryService } from './customer-directory.service';

@Controller('customer-directory')
@UseGuards(AuthGuard('jwt'))
export class CustomerDirectoryController {
  constructor(private readonly service: CustomerDirectoryService) {}

  @Get('search')
  search(
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('product') product?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.search({ search, city, state, product, page, limit });
  }

  @Get('orders')
  orders(@Query('customerId') customerId: string) {
    return this.service.orders(customerId);
  }

  @Get('filters')
  filters() {
    return this.service.filters();
  }

  @Post('import')
  importCustomers(@Body() body: { rows: any[] }) {
    return this.service.importCustomers(body.rows ?? []);
  }

  @Post('sync-locations')
  syncLocations() {
    return this.service.syncLocationsFromAddresses();
  }
}
