// ============================================================
// FILE: backend/src/sales-learning/sales-learning.service.ts
// ============================================================
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesLearningService {
  constructor(private prisma: PrismaService) {}

  // ── TOPICS ──────────────────────────────────────────────────

  async getAllTopicsForUser(userId: string) {
    const topics = await this.prisma.salesTopic.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      include: {
        _count: { select: { questions: true } },
        userProgress: { where: { userId } },
      },
    });

    return topics.map((t, idx) => {
      const progress = t.userProgress[0] || null;
      const isFirst = idx === 0;
      const prevProgress = idx > 0 ? topics[idx - 1].userProgress[0] : null;
      const isUnlocked = isFirst || (prevProgress?.completedAt != null);

      return {
        id: t.id,
        orderIndex: t.orderIndex,
        groupNumber: t.groupNumber,
        titleEn: t.titleEn,
        titleHi: t.titleHi,
        sourceBook: t.sourceBook,
        difficulty: t.difficulty,
        estimatedMins: t.estimatedMins,
        questionCount: t._count.questions,
        isUnlocked,
        isCompleted: !!progress?.completedAt,
        topicRead: !!progress?.topicRead,
        quizPassed: !!progress?.quizPassed,
        bestScore: progress?.bestScore || 0,
        quizAttempts: progress?.quizAttempts || 0,
      };
    });
  }

  async getTopicDetail(userId: string, topicId: string) {
    const topic = await this.prisma.salesTopic.findUnique({
      where: { id: topicId },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
        userProgress: { where: { userId } },
      },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    // Check unlock status
    const allTopics = await this.prisma.salesTopic.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      include: { userProgress: { where: { userId } } },
    });
    const topicIdx = allTopics.findIndex(t => t.id === topicId);
    const isFirst = topicIdx === 0;
    const prevCompleted = topicIdx > 0 ? !!allTopics[topicIdx - 1].userProgress[0]?.completedAt : false;
    if (!isFirst && !prevCompleted) throw new ForbiddenException('Complete previous topic first');

    // Mark as read
    await this.prisma.userTopicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: { userId, topicId, topicRead: true, topicReadAt: new Date(), isUnlocked: true },
      update: { topicRead: true, topicReadAt: new Date() },
    });

    // Log daily streak
    await this.logDailyActivity(userId, 'read');

    return {
      ...topic,
      userProgress: topic.userProgress[0] || null,
    };
  }

  // ── QUIZ ─────────────────────────────────────────────────────

  async submitQuiz(userId: string, topicId: string, answers: number[], timeTakenSecs?: number) {
    const topic = await this.prisma.salesTopic.findUnique({
      where: { id: topicId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    // Score it
    let score = 0;
    const results = topic.questions.map((q, idx) => {
      const chosen = answers[idx] ?? -1;
      const correct = chosen === q.correctIndex;
      if (correct) score++;
      return {
        questionId: q.id,
        chosen,
        correct,
        correctIndex: q.correctIndex,
        explanationEn: q.explanationEn,
        explanationHi: q.explanationHi,
      };
    });

    const passed = score === topic.questions.length; // must get ALL 5 correct
    const totalQ = topic.questions.length;

    // Save attempt
    await this.prisma.quizAttempt.create({
      data: { userId, topicId, answers, score, passed, timeTakenSecs },
    });

    // Update progress
    const existing = await this.prisma.userTopicProgress.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });

    const updateData: any = {
      quizAttempts: (existing?.quizAttempts || 0) + 1,
      bestScore: Math.max(existing?.bestScore || 0, score),
    };

    if (passed) {
      updateData.quizPassed = true;
      updateData.quizPassedAt = new Date();
      updateData.completedAt = new Date();
    }

    await this.prisma.userTopicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId, topicId, topicRead: true, isUnlocked: true,
        quizAttempts: 1, bestScore: score,
        quizPassed: passed, quizPassedAt: passed ? new Date() : null,
        completedAt: passed ? new Date() : null,
      },
      update: updateData,
    });

    await this.logDailyActivity(userId, 'quiz');

    return { score, totalQ, passed, results };
  }

  // ── MILESTONE TEST ───────────────────────────────────────────

  async getMilestoneTest(userId: string, groupNumber: number) {
    const test = await this.prisma.milestoneTest.findUnique({
      where: { groupNumber },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!test) throw new NotFoundException('Milestone test not found');

    // Verify all 5 topics in group are completed
    const groupTopics = await this.prisma.salesTopic.findMany({
      where: { groupNumber, isActive: true },
      include: { userProgress: { where: { userId } } },
    });
    const allDone = groupTopics.every(t => !!t.userProgress[0]?.completedAt);
    if (!allDone) throw new ForbiddenException('Complete all topics in this group first');

    return test;
  }

  async submitMilestoneTest(userId: string, testId: string, answers: number[], timeTakenSecs?: number) {
    const test = await this.prisma.milestoneTest.findUnique({
      where: { id: testId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!test) throw new NotFoundException('Test not found');

    let score = 0;
    const results = test.questions.map((q, idx) => {
      const chosen = answers[idx] ?? -1;
      const correct = chosen === q.correctIndex;
      if (correct) score += q.marksPerQ;
      return { chosen, correct, correctIndex: q.correctIndex };
    });

    const percentage = (score / test.totalMarks) * 100;
    const passed = percentage >= 60;

    await this.prisma.milestoneAttempt.create({
      data: { userId, testId, answers, score, percentage, passed, timeTakenSecs },
    });

    return { score, totalMarks: test.totalMarks, percentage, passed, results };
  }

  // ── ANALYTICS (ADMIN) ────────────────────────────────────────

  async getDashboardAnalytics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeToday,
      totalCompletions,
      topicStats,
      leaderboard,
      dailyActivity,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),

      this.prisma.dailyLearningStreak.count({
        where: { date: { gte: today } },
      }),

      this.prisma.userTopicProgress.count({
        where: { completedAt: { not: null } },
      }),

      this.prisma.salesTopic.findMany({
        where: { isActive: true },
        orderBy: { orderIndex: 'asc' },
        include: {
          _count: { select: { userProgress: true, quizAttempts: true } },
          userProgress: { where: { completedAt: { not: null } } },
        },
      }),

      this.prisma.user.findMany({
        where: { isActive: true },
        include: {
          learningProgress: { where: { completedAt: { not: null } } },
          learningStreaks: { orderBy: { date: 'desc' }, take: 7 },
        },
        take: 20,
      }),

      this.prisma.dailyLearningStreak.groupBy({
        by: ['date'],
        _sum: { topicsRead: true, quizzesDone: true },
        orderBy: { date: 'desc' },
        take: 30,
      }),
    ]);

    return {
      summary: { totalUsers, activeToday, totalCompletions },
      topicStats: topicStats.map(t => ({
        id: t.id,
        titleEn: t.titleEn,
        orderIndex: t.orderIndex,
        completions: t.userProgress.length,
        totalAttempts: t._count.quizAttempts,
      })),
      leaderboard: leaderboard
        .map(u => ({
          id: u.id,
          name: u.fullName,
          completedTopics: u.learningProgress.length,
          lastActiveDate: u.learningStreaks[0]?.date || null,
          streak: u.learningStreaks.length,
        }))
        .sort((a, b) => b.completedTopics - a.completedTopics),
      dailyActivity,
    };
  }

  // ── ADMIN: TOPIC CRUD ────────────────────────────────────────

  async createTopic(data: any) {
    return this.prisma.salesTopic.create({ data });
  }

  async updateTopic(id: string, data: any) {
    return this.prisma.salesTopic.update({ where: { id }, data });
  }

  async deleteTopic(id: string) {
    return this.prisma.salesTopic.delete({ where: { id } });
  }

  async createQuestion(topicId: string, data: any) {
    return this.prisma.topicQuestion.create({ data: { ...data, topicId } });
  }

  async updateQuestion(id: string, data: any) {
    return this.prisma.topicQuestion.update({ where: { id }, data });
  }

  async deleteQuestion(id: string) {
    return this.prisma.topicQuestion.delete({ where: { id } });
  }

  // ── HELPERS ──────────────────────────────────────────────────

  private async logDailyActivity(userId: string, type: 'read' | 'quiz') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inc = type === 'read'
      ? { topicsRead: { increment: 1 }, pointsEarned: { increment: 10 } }
      : { quizzesDone: { increment: 1 }, pointsEarned: { increment: 25 } };

    await this.prisma.dailyLearningStreak.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId, date: today,
        topicsRead: type === 'read' ? 1 : 0,
        quizzesDone: type === 'quiz' ? 1 : 0,
        pointsEarned: type === 'read' ? 10 : 25,
      },
      update: inc,
    });
  }
}

// ============================================================
// FILE: backend/src/sales-learning/sales-learning.controller.ts
// ============================================================
/*
import { Controller, Get, Post, Put, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesLearningService } from './sales-learning.service';

@Controller('sales-learning')
@UseGuards(AuthGuard('jwt'))
export class SalesLearningController {
  constructor(private readonly service: SalesLearningService) {}

  // User routes
  @Get('topics')
  getTopics(@Request() req) {
    return this.service.getAllTopicsForUser(req.user.id);
  }

  @Get('topics/:id')
  getTopic(@Request() req, @Param('id') id: string) {
    return this.service.getTopicDetail(req.user.id, id);
  }

  @Post('topics/:id/quiz')
  submitQuiz(@Request() req, @Param('id') topicId: string, @Body() body: { answers: number[]; timeTakenSecs?: number }) {
    return this.service.submitQuiz(req.user.id, topicId, body.answers, body.timeTakenSecs);
  }

  @Get('milestone/:group')
  getMilestoneTest(@Request() req, @Param('group') group: string) {
    return this.service.getMilestoneTest(req.user.id, parseInt(group));
  }

  @Post('milestone/:testId/submit')
  submitMilestoneTest(@Request() req, @Param('testId') testId: string, @Body() body: { answers: number[]; timeTakenSecs?: number }) {
    return this.service.submitMilestoneTest(req.user.id, testId, body.answers, body.timeTakenSecs);
  }

  // Admin routes
  @Get('admin/analytics')
  getAnalytics() {
    return this.service.getDashboardAnalytics();
  }

  @Post('admin/topics')
  createTopic(@Body() data: any) {
    return this.service.createTopic(data);
  }

  @Put('admin/topics/:id')
  updateTopic(@Param('id') id: string, @Body() data: any) {
    return this.service.updateTopic(id, data);
  }

  @Delete('admin/topics/:id')
  deleteTopic(@Param('id') id: string) {
    return this.service.deleteTopic(id);
  }

  @Post('admin/topics/:topicId/questions')
  createQuestion(@Param('topicId') topicId: string, @Body() data: any) {
    return this.service.createQuestion(topicId, data);
  }

  @Put('admin/questions/:id')
  updateQuestion(@Param('id') id: string, @Body() data: any) {
    return this.service.updateQuestion(id, data);
  }

  @Delete('admin/questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.service.deleteQuestion(id);
  }
}
*/