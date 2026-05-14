import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type JwtUser = { id: string; role: string; fullName?: string };

type AnalysisPayload = {
  agentName: string;
  customerName: string;
  callType: string;
  duration?: string;
  overallScore: number;
  grade: string;
  sentiment?: string;
  language?: string;
  transcript?: string;
  transcriptSummary?: string;
  strengthsList: string[];
  improvementsList: string[];
  categoryScores: Record<string, number>;
  coachFeedback?: string;
  actionItems: string[];
  hasRealTranscript?: boolean;
};

const CATEGORY_NAMES = [
  'Rapport',
  'Needs Discovery',
  'Product Presentation',
  'Objection Handling',
  'Closing',
  'Follow-up Plan',
];

@Injectable()
export class CallAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtUser, payload: AnalysisPayload) {
    const agent = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, fullName: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const normalized = this.normalizeAnalysis(payload);
    return this.prisma.callAnalysis.create({
      data: {
        agentId: agent.id,
        agentName: payload.agentName || agent.fullName,
        customerName: payload.customerName,
        callType: payload.callType,
        duration: payload.duration ?? null,
        overallScore: normalized.overallScore,
        grade: normalized.grade,
        sentiment: normalized.sentiment,
        language: normalized.language,
        transcript: payload.transcript ?? null,
        transcriptSummary: normalized.transcriptSummary,
        strengthsList: normalized.strengthsList,
        improvementsList: normalized.improvementsList,
        categoryScores: normalized.categoryScores,
        coachFeedback: normalized.coachFeedback,
        actionItems: normalized.actionItems,
        hasRealTranscript: !!payload.hasRealTranscript,
      },
    });
  }

  async findAll(user: JwtUser, query: { agentId?: string; grade?: string; from?: string; to?: string }) {
    const where: any = {};
    if (user.role !== 'ADMIN') where.agentId = user.id;
    if (user.role === 'ADMIN' && query.agentId) where.agentId = query.agentId;
    if (query.grade) where.grade = query.grade;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    return this.prisma.callAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: JwtUser, id: string) {
    const row = await this.prisma.callAnalysis.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Call analysis not found');
    if (user.role !== 'ADMIN' && row.agentId !== user.id) {
      throw new ForbiddenException('You can only view your own call analysis');
    }
    return row;
  }

  async remove(user: JwtUser, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    await this.prisma.callAnalysis.delete({ where: { id } });
    return { success: true };
  }

  async leaderboard(user: JwtUser) {
    const rows = await this.prisma.callAnalysis.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        agentId: true,
        agentName: true,
        overallScore: true,
        createdAt: true,
      },
    });
    const visibleRows = user.role === 'ADMIN' ? rows : rows.filter((row) => row.agentId === user.id);
    const map = new Map<string, { agentId: string; agentName: string; scores: number[]; dates: Date[] }>();

    for (const row of visibleRows) {
      const current = map.get(row.agentId) ?? { agentId: row.agentId, agentName: row.agentName, scores: [], dates: [] };
      current.scores.push(row.overallScore);
      current.dates.push(row.createdAt);
      map.set(row.agentId, current);
    }

    return [...map.values()]
      .map((row) => {
        const averageScore = Math.round(row.scores.reduce((sum, score) => sum + score, 0) / row.scores.length);
        const bestScore = Math.max(...row.scores);
        const half = Math.max(1, Math.floor(row.scores.length / 2));
        const earlier = row.scores.slice(0, half);
        const later = row.scores.slice(-half);
        const earlierAvg = earlier.reduce((sum, score) => sum + score, 0) / earlier.length;
        const laterAvg = later.reduce((sum, score) => sum + score, 0) / later.length;
        const trend = laterAvg >= earlierAvg + 2 ? 'improving' : laterAvg <= earlierAvg - 2 ? 'declining' : 'steady';
        return {
          agentId: row.agentId,
          agentName: row.agentName,
          totalCalls: row.scores.length,
          averageScore,
          bestScore,
          trend,
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore || b.totalCalls - a.totalCalls);
  }

  async transcribe(file: Express.Multer.File) {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) return { transcript: null, error: 'ASSEMBLYAI_API_KEY not set' };
    if (!file) return { transcript: null, error: 'No audio file provided' };

    try {
      // Step 1: Upload audio file to AssemblyAI
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'content-type': 'application/octet-stream',
        },
        body: new Uint8Array(file.buffer),
      });
      const uploadData = await uploadRes.json();
      const audioUrl = uploadData.upload_url;
      if (!audioUrl) return { transcript: null, error: `Upload failed: ${JSON.stringify(uploadData)}` };

      // Step 2: Request transcription
      const transcribeRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          speech_models: ['universal-2'],
          punctuate: true,
          format_text: true,
          speaker_labels: true,
          speakers_expected: 2,
        }),
      });
      const transcribeData = await transcribeRes.json();
      const transcriptId = transcribeData.id;
      if (!transcriptId) return { transcript: null, error: `Transcription request failed: ${JSON.stringify(transcribeData)}` };

      // Step 3: Poll for result (max 60 seconds)
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: { 'authorization': apiKey },
        });
        const pollData = await pollRes.json();
        if (pollData.status === 'completed') {
          // Format transcript with speaker labels
          let formattedTranscript = pollData.text;
          if (pollData.utterances && pollData.utterances.length > 0) {
            formattedTranscript = pollData.utterances
              .map((u: any) => `Speaker ${u.speaker}: ${u.text}`)
              .join('\n\n');
          }
          const duration = pollData.audio_duration
            ? `${Math.floor(pollData.audio_duration / 60)}:${String(Math.round(pollData.audio_duration % 60)).padStart(2, '0')}`
            : null;
          return {
            transcript: formattedTranscript,
            language: pollData.language_code ?? 'hi',
            duration,
            words: pollData.words?.length ?? 0,
            utterances: pollData.utterances ?? [],
          };
        }
        if (pollData.status === 'error') {
          return { transcript: null, error: pollData.error };
        }
      }
      return { transcript: null, error: 'Transcription timed out' };
    } catch (e) {
      return { transcript: null, error: String(e) };
    }
  }

  async analyze(payload: {
    agentName: string;
    customerName: string;
    callType: string;
    duration?: string;
    transcript: string;
    hasRealTranscript?: boolean;
  }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return this.simulateAnalysis(payload);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
          max_tokens: 1800,
          temperature: 0.2,
          messages: [
            {
              role: 'user',
              content: this.buildPrompt(payload),
            },
          ],
        }),
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text;
      if (!res.ok || !text) return this.simulateAnalysis(payload);
      return this.normalizeAnalysis(this.extractJson(text));
    } catch {
      return this.simulateAnalysis(payload);
    }
  }

  private buildPrompt(payload: { agentName: string; customerName: string; callType: string; duration?: string; transcript: string }) {
    return `Analyze this sales call transcript for RarePrint ERP.

Agent: ${payload.agentName}
Customer: ${payload.customerName}
Call type: ${payload.callType}
Duration: ${payload.duration || 'Unknown'}

Use SPIN Selling, BANT, Challenger Sale, objection handling, rapport building, and closing techniques.
Return only valid JSON with this exact shape:
{
  "overallScore": 0,
  "grade": "Excellent|Good|Average|Needs Work",
  "duration": "string",
  "sentiment": "Positive|Neutral|Negative|Mixed",
  "language": "string",
  "categoryScores": {
    "Rapport": 0,
    "Needs Discovery": 0,
    "Product Presentation": 0,
    "Objection Handling": 0,
    "Closing": 0,
    "Follow-up Plan": 0
  },
  "strengthsList": ["", "", ""],
  "improvementsList": ["", "", ""],
  "coachFeedback": "specific coaching referencing SPIN/BANT/Challenger",
  "actionItems": ["", "", "", ""],
  "transcriptSummary": "short summary"
}

Transcript:
${payload.transcript}`;
  }

  private extractJson(text: string): AnalysisPayload {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  }

  private normalizeAnalysis(value: any) {
    const categoryScores: Record<string, number> = {};
    for (const name of CATEGORY_NAMES) {
      categoryScores[name] = this.clampScore(Number(value?.categoryScores?.[name] ?? value?.categoryScores?.[name.toLowerCase()] ?? 60));
    }
    const overallScore = this.clampScore(Number(value?.overallScore ?? this.average(Object.values(categoryScores))));
    return {
      overallScore,
      grade: value?.grade || this.gradeFor(overallScore),
      duration: value?.duration ?? null,
      sentiment: value?.sentiment ?? 'Neutral',
      language: value?.language ?? 'Mixed',
      categoryScores,
      strengthsList: this.toList(value?.strengthsList ?? value?.strengths, 3, [
        'Maintained a professional tone',
        'Explained the product clearly',
        'Kept the conversation moving',
      ]),
      improvementsList: this.toList(value?.improvementsList ?? value?.improvements, 3, [
        'Ask more SPIN problem and implication questions',
        'Confirm budget and authority using BANT',
        'Close with a clearer next step',
      ]),
      coachFeedback:
        value?.coachFeedback ??
        'Use SPIN to uncover deeper pain, BANT to qualify budget and timeline, and a Challenger-style insight to reframe the customer need before closing.',
      actionItems: this.toList(value?.actionItems, 4, [
        'Open the next call with one rapport question',
        'Ask for budget range and decision owner',
        'Summarize the customer pain in one sentence',
        'End with a dated follow-up commitment',
      ]),
      transcriptSummary: value?.transcriptSummary ?? 'The call was reviewed for sales quality and follow-up readiness.',
    };
  }

  private simulateAnalysis(payload: { transcript: string; duration?: string }) {
    const words = payload.transcript.split(/\s+/).filter(Boolean);
    const hasQuestions = (payload.transcript.match(/\?/g) ?? []).length;
    const score = this.clampScore(62 + Math.min(14, hasQuestions * 3) + Math.min(12, Math.floor(words.length / 80)));
    return this.normalizeAnalysis({
      overallScore: score,
      grade: this.gradeFor(score),
      duration: payload.duration ?? 'Unknown',
      sentiment: score >= 75 ? 'Positive' : 'Neutral',
      language: /[\u0900-\u097F]/.test(payload.transcript) ? 'Hindi / Hinglish' : 'English / Hinglish',
      categoryScores: {
        Rapport: score,
        'Needs Discovery': score - 6,
        'Product Presentation': score + 4,
        'Objection Handling': score - 4,
        Closing: score - 8,
        'Follow-up Plan': score - 2,
      },
      transcriptSummary: words.slice(0, 35).join(' ') || 'Simulated transcript analysis generated.',
    });
  }

  private toList(value: unknown, count: number, fallback: string[]) {
    const list = Array.isArray(value) ? value.map(String).filter(Boolean) : [];
    return [...list, ...fallback].slice(0, count);
  }

  private average(values: number[]) {
    return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
  }

  private clampScore(value: number) {
    if (!Number.isFinite(value)) return 60;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private gradeFor(score: number) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Average';
    return 'Needs Work';
  }
}
