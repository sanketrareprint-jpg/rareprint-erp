import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DesignStudioService } from './design-studio.service';

@Controller('design-studio')
@UseGuards(AuthGuard('jwt'))
export class DesignStudioController {
  constructor(private readonly service: DesignStudioService) {}

  @Post('envelope/layout')
  createEnvelopeLayout(@Body() body: any) {
    return this.service.createEnvelopeLayout(body);
  }
}
