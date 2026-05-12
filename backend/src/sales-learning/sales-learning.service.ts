import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesLearningService {
  constructor(private prisma: PrismaService) {}

  async getTopicsForUser(userId: string) {
    const topics = await this.prisma.salesTopic.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      include: {
        questions: { select: { id: true, questionEn: true, questionHi: true, options: true, correctIndex: true } },
      },
    });

    const progressRecords = await this.prisma.userTopicProgress.findMany({
      where: { userId },
    });

    const progressMap: Record<string, any> = {};
    progressRecords.forEach(p => { progressMap[p.topicId] = p; });

    const streak = await this.getStreak(userId);
    const totalPoints = progressRecords.filter(p => p.completed).length * 50;

    const topicsWithProgress = topics.map((topic, idx) => {
      const isCompleted = progressMap[topic.id]?.completed || false;
      const prevTopic = idx > 0 ? topics[idx - 1] : null;
      const prevCompleted = prevTopic ? (progressMap[prevTopic.id]?.completed || false) : true;
      const isLocked = idx > 0 && !prevCompleted;

      return {
        ...topic,
        isCompleted,
        isLocked,
      };
    });

    return { topics: topicsWithProgress, progress: progressMap, streak, totalPoints };
  }

  async completeTopic(userId: string, topicId: string, score: number, totalQuestions: number) {
    await this.prisma.userTopicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      update: { completed: true, quizPassed: true, score, quizAttempts: { increment: 1 } },
      create: { userId, topicId, completed: true, quizPassed: true, score, quizAttempts: 1 },
    });

    // Update daily streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await this.prisma.dailyLearningStreak.upsert({
      where: { userId_date: { userId, date: today } },
      update: { topicsCompleted: { increment: 1 } },
      create: { userId, date: today, topicsCompleted: 1 },
    });

    return { success: true };
  }

  async getStreak(userId: string): Promise<number> {
    const streaks = await this.prisma.dailyLearningStreak.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30,
    });
    if (streaks.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < streaks.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      const actual = new Date(streaks[i].date);
      actual.setHours(0, 0, 0, 0);
      if (expected.getTime() === actual.getTime()) { streak++; } else { break; }
    }
    return streak;
  }

  async getAnalytics(userId: string) {
    const allProgress = await this.prisma.userTopicProgress.findMany({ where: { userId } });
    return {
      completed: allProgress.filter(p => p.completed).length,
      totalPoints: allProgress.filter(p => p.completed).length * 50,
    };
  }
}
