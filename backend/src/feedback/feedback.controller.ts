import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeedbackService, type FeedbackUser } from './feedback.service';
import type { FeedbackBody } from './feedback.calc';

type AuthedRequest = { user: FeedbackUser };

// Feedback module — admins and sales agents only (enforced in the service,
// where a sales agent is also limited to their own orders).
@Controller('feedback')
@UseGuards(AuthGuard('jwt'))
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  @Get('pending')
  listPending(@Req() req: AuthedRequest) {
    return this.svc.listPending(req.user);
  }

  @Get('submitted')
  listSubmitted(@Req() req: AuthedRequest) {
    return this.svc.listSubmitted(req.user);
  }

  @Get('orders/:orderId')
  getOrder(@Param('orderId') orderId: string, @Req() req: AuthedRequest) {
    return this.svc.getOrder(orderId, req.user);
  }

  @Post('orders/:orderId')
  submit(
    @Param('orderId') orderId: string,
    @Body() body: FeedbackBody,
    @Req() req: AuthedRequest,
  ) {
    return this.svc.submit(orderId, body, req.user);
  }
}
