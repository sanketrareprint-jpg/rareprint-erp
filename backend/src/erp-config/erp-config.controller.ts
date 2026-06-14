import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErpConfigService, type ErpConfig } from './erp-config.service';

@Controller('erp-config')
@UseGuards(AuthGuard('jwt'))
export class ErpConfigController {
  constructor(private readonly erpConfig: ErpConfigService) {}

  @Get()
  getConfig() {
    return this.erpConfig.getConfig();
  }

  @Put()
  updateConfig(@Body() body: Partial<ErpConfig>) {
    return this.erpConfig.updateConfig(body);
  }
}
