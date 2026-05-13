import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesLearningService } from './sales-learning.service';

@Controller('sales-learning')
@UseGuards(AuthGuard('jwt'))
export class SalesLearningController {
  constructor(private readonly salesLearningService: SalesLearningService) {}

  @Get('topics')
  getTopics(@Request() req) {
    return this.salesLearningService.getAllTopicsForUser(req.user.id);
  }

  @Get('topics/:id')
  getTopic(@Request() req, @Param('id') id: string) {
    return this.salesLearningService.getTopicDetail(req.user.id, id);
  }

  @Post('topics/:id/quiz')
  submitQuiz(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { answers: number[]; timeTakenSecs?: number },
  ) {
    return this.salesLearningService.submitQuiz(
      req.user.id,
      id,
      body.answers ?? [],
      body.timeTakenSecs,
    );
  }

  @Post('topics/:id/complete')
  completeTopic(@Param('id') id: string, @Request() req, @Body() body: any) {
    return this.salesLearningService.submitQuiz(req.user.id, id, body.answers ?? [], body.timeTakenSecs);
  }

  @Get('admin/analytics')
  getAnalytics() {
    return this.salesLearningService.getDashboardAnalytics();
  }
}
