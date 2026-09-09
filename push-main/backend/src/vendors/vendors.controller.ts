// backend/src/vendors/vendors.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VendorsService } from './vendors.service';

@Controller('vendors')
@UseGuards(AuthGuard('jwt'))
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  list() { return this.vendorsService.listVendors(); }

  @Post()
  create(@Body() body: { name: string; phone?: string; email?: string; address?: string; gstNumber?: string }) {
    return this.vendorsService.createVendor(body);
  }
}
