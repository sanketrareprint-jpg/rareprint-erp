import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesLearningService } from './sales-learning.service';

@Controller('sales-learning')
@UseGuards(AuthGuard('jwt'))
export class SalesLearningController {
  constructor(private readonly salesLearningService: SalesLearningService) {}

  @Get('topics')
  getTopics(@Request() req) {
    return this.salesLearningService.getTopicsForUser(req.user.id);
  }

  @Post('topics/:id/complete')
  completeTopic(@Param('id') id: string, @Request() req, @Body() body: any) {
    return this.salesLearningService.completeTopic(req.user.id, id, body.score, body.totalQuestions);
  }

  @Get('analytics')
  getAnalytics(@Request() req) {
    return this.salesLearningService.getAnalytics(req.user.id);
  }
}
