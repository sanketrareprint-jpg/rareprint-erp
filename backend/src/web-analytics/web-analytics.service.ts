// backend/src/web-analytics/web-analytics.service.ts
//
// Owner-only Web Analytics: pulls GA4 (Data API) and Search Console data with
// a Google Cloud service account and stores it in WebAnalyticsReport, so the
// dashboard reads from our DB and never calls Google on page load.
//
// Off (cron no-ops, summary says configured: false) unless all three are set:
//   GOOGLE_SERVICE_ACCOUNT_JSON — the key file JSON, raw or base64. Server-only.
//   GA4_PROPERTY_ID             — numeric GA4 property id.
//   GSC_SITE_URL                — Search Console property, e.g.
//                                 "sc-domain:rareprint.in" or "https://rareprint.in/".
// SaaS customer deployments don't set them, so this stays dormant there.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

export const RANGE_DAYS = [7, 28, 90] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

const TOP_PRODUCT_PAGES = 20;
const TOP_LIST_ROWS = 20;
const TOP_GSC_ROWS = 50;
// "Easy wins": queries already ranking on page 1-2 (avg position 5-20) with
// real search demand. Demand is scaled to the range so 7/28/90 days are
// comparable: at least 2 impressions per day of the range.
const EASY_WIN_MIN_POSITION = 5;
const EASY_WIN_MAX_POSITION = 20;
const EASY_WIN_MIN_IMPRESSIONS_PER_DAY = 2;
// Enough query rows to find easy wins below the top-50-by-clicks list.
const GSC_QUERY_FETCH_LIMIT = 1000;
// Search Console lags ~2-3 days; look back far enough to cover 90 + 90 days
// of daily rows ending at its latest final day.
const GSC_DAILY_LOOKBACK_DAYS = 200;

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

type Period = 'current' | 'previous';
type DateRange = { startDate: string; endDate: string };
type GscRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type StoredReport = { source: 'GA4' | 'GSC'; report: string; rangeDays: number; period: Period; range: DateRange; rows: unknown };

export function isWebAnalyticsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() &&
    process.env.GA4_PROPERTY_ID?.trim() &&
    process.env.GSC_SITE_URL?.trim(),
  );
}

// Accepts the key file pasted raw or base64-encoded (Railway variables handle
// either). Never logged or returned anywhere.
function readServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!.trim();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(json);
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not a service account key (missing client_email/private_key)');
  }
  return parsed;
}

/** YYYY-MM-DD for "today" in India, the business's (and GA4 property's) timezone. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The N days ending on `endDate` (inclusive), and the N days just before them. */
export function periodRanges(endDate: string, rangeDays: number): Record<Period, DateRange> {
  const currentStart = addDays(endDate, -(rangeDays - 1));
  const previousEnd = addDays(currentStart, -1);
  return {
    current: { startDate: currentStart, endDate },
    previous: { startDate: addDays(previousEnd, -(rangeDays - 1)), endDate: previousEnd },
  };
}

export function pickEasyWins(queries: GscRow[], rangeDays: number): GscRow[] {
  const minImpressions = EASY_WIN_MIN_IMPRESSIONS_PER_DAY * rangeDays;
  return queries
    .filter((q) => q.position >= EASY_WIN_MIN_POSITION && q.position <= EASY_WIN_MAX_POSITION && q.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, TOP_GSC_ROWS);
}

export function parseRange(value: string | undefined): RangeDays {
  const n = Number(value ?? 28);
  if (!(RANGE_DAYS as readonly number[]).includes(n)) {
    throw new BadRequestException(`range must be one of ${RANGE_DAYS.join(', ')}`);
  }
  return n as RangeDays;
}

@Injectable()
export class WebAnalyticsService {
  private readonly logger = new Logger(WebAnalyticsService.name);
  private syncing = false;

  constructor(private readonly prisma: PrismaService) {}

  private googleAuth() {
    return new google.auth.GoogleAuth({ credentials: readServiceAccountCredentials(), scopes: GOOGLE_SCOPES });
  }

  @Cron('0 0 */6 * * *', { timeZone: 'Asia/Kolkata' })
  async scheduledSync() {
    if (!isWebAnalyticsConfigured()) return;
    await this.sync('CRON');
  }

  /** Runs one sync. GA4 and Search Console are stored independently, so one failing doesn't block the other. */
  async sync(trigger: 'CRON' | 'MANUAL') {
    if (!isWebAnalyticsConfigured()) {
      return { status: 'NOT_CONFIGURED' as const };
    }
    if (this.syncing) return { status: 'ALREADY_RUNNING' as const };
    this.syncing = true;
    const errors: string[] = [];
    let ga4Ok = false;
    let gscOk = false;
    let gscDataUpTo: string | null = null;
    let logId: string;
    try {
      logId = (await this.prisma.webAnalyticsSyncLog.create({ data: { trigger } })).id;
    } catch (err) {
      this.syncing = false;
      throw err;
    }
    try {
      const auth = this.googleAuth();
      try {
        await this.saveReports(await this.fetchGa4Reports(auth));
        ga4Ok = true;
      } catch (err: any) {
        errors.push(`GA4: ${googleErrorMessage(err)}`);
        this.logger.error(`Web analytics GA4 sync failed: ${googleErrorMessage(err)}`);
      }
      try {
        const gsc = await this.fetchGscReports(auth);
        gscDataUpTo = gsc.dataUpTo;
        await this.saveReports(gsc.reports);
        gscOk = true;
      } catch (err: any) {
        errors.push(`Search Console: ${googleErrorMessage(err)}`);
        this.logger.error(`Web analytics Search Console sync failed: ${googleErrorMessage(err)}`);
      }
    } catch (err: any) {
      // Credential parsing / auth setup — both sources fail.
      errors.push(googleErrorMessage(err));
      this.logger.error(`Web analytics sync failed: ${googleErrorMessage(err)}`);
    } finally {
      this.syncing = false;
    }
    const status = ga4Ok && gscOk ? 'SUCCESS' : ga4Ok || gscOk ? 'PARTIAL' : 'FAILED';
    await this.prisma.webAnalyticsSyncLog.update({
      where: { id: logId },
      data: { status, ga4Ok, gscOk, gscDataUpTo, error: errors.length ? errors.join('\n').slice(0, 4000) : null, finishedAt: new Date() },
    });
    return { status, errors };
  }

  private async saveReports(reports: StoredReport[]) {
    const syncedAt = new Date();
    await this.prisma.$transaction(
      reports.map((r) => {
        const data = { startDate: r.range.startDate, endDate: r.range.endDate, rows: r.rows as any, syncedAt };
        return this.prisma.webAnalyticsReport.upsert({
          where: { source_report_rangeDays_period: { source: r.source, report: r.report, rangeDays: r.rangeDays, period: r.period } },
          create: { source: r.source, report: r.report, rangeDays: r.rangeDays, period: r.period, ...data },
          update: data,
        });
      }),
    );
  }

  // ── GA4 ──────────────────────────────────────────────────────────────────

  private async fetchGa4Reports(auth: any): Promise<StoredReport[]> {
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
    const property = `properties/${process.env.GA4_PROPERTY_ID!.trim()}`;
    const run = async (range: DateRange, body: Record<string, unknown>) => {
      const res = await analyticsData.properties.runReport({ property, requestBody: { dateRanges: [range], ...body } });
      return (res.data.rows ?? []).map((row) => ({
        dims: (row.dimensionValues ?? []).map((v) => v.value ?? ''),
        mets: (row.metricValues ?? []).map((v) => Number(v.value ?? 0)),
      }));
    };
    const list = (range: DateRange, dimension: string, metrics: string[], limit: number, extra: Record<string, unknown> = {}) =>
      run(range, {
        dimensions: [{ name: dimension }],
        metrics: metrics.map((name) => ({ name })),
        orderBys: [{ metric: { metricName: metrics[0] }, desc: true }],
        limit: String(limit),
        ...extra,
      }).then((rows) => rows.map((r) => ({ key: r.dims[0], ...Object.fromEntries(metrics.map((m, i) => [m, r.mets[i]])) })));

    // GA4 days are complete only up to yesterday.
    const yesterday = addDays(todayIst(), -1);
    const reports: StoredReport[] = [];
    for (const rangeDays of RANGE_DAYS) {
      const ranges = periodRanges(yesterday, rangeDays);
      for (const period of ['current', 'previous'] as const) {
        const range = ranges[period];
        const [totals] = await run(range, {
          metrics: ['activeUsers', 'sessions', 'screenPageViews', 'userEngagementDuration'].map((name) => ({ name })),
        });
        reports.push({
          source: 'GA4', report: 'totals', rangeDays, period, range,
          rows: { users: totals?.mets[0] ?? 0, sessions: totals?.mets[1] ?? 0, pageViews: totals?.mets[2] ?? 0, engagementSeconds: totals?.mets[3] ?? 0 },
        });
        // E-commerce is fetched on its own so a property without e-commerce
        // events still gets every other report.
        let ecommerce: unknown;
        try {
          const [e] = await run(range, { metrics: ['ecommercePurchases', 'purchaseRevenue', 'addToCarts'].map((name) => ({ name })) });
          ecommerce = { available: true, purchases: e?.mets[0] ?? 0, revenue: e?.mets[1] ?? 0, addToCarts: e?.mets[2] ?? 0 };
        } catch (err: any) {
          ecommerce = { available: false, reason: googleErrorMessage(err) };
        }
        reports.push({ source: 'GA4', report: 'ecommerce', rangeDays, period, range, rows: ecommerce });
      }

      const range = ranges.current;
      const [productPages, channels, sources, devices, cities, regions] = await Promise.all([
        list(range, 'pagePath', ['screenPageViews', 'activeUsers'], TOP_PRODUCT_PAGES, {
          dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/products/' } } },
        }),
        list(range, 'sessionDefaultChannelGroup', ['sessions', 'activeUsers'], TOP_LIST_ROWS),
        list(range, 'sessionSourceMedium', ['sessions', 'activeUsers'], TOP_LIST_ROWS),
        list(range, 'deviceCategory', ['activeUsers', 'sessions'], TOP_LIST_ROWS),
        list(range, 'city', ['activeUsers', 'sessions'], TOP_LIST_ROWS),
        list(range, 'region', ['activeUsers', 'sessions'], TOP_LIST_ROWS),
      ]);
      const current = (report: string, rows: unknown): StoredReport => ({ source: 'GA4', report, rangeDays, period: 'current', range, rows });
      reports.push(
        current('productPages', productPages),
        current('channels', channels),
        current('sources', sources),
        current('devices', devices),
        current('cities', cities),
        current('regions', regions),
      );
    }
    return reports;
  }

  // ── Search Console ───────────────────────────────────────────────────────

  private async fetchGscReports(auth: any): Promise<{ dataUpTo: string; reports: StoredReport[] }> {
    const searchConsole = google.searchconsole({ version: 'v1', auth });
    const siteUrl = process.env.GSC_SITE_URL!.trim();
    const query = async (range: DateRange, dimensions: string[], rowLimit: number): Promise<GscRow[]> => {
      const res = await searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: { ...range, dimensions, rowLimit, dataState: 'final' },
      });
      return (res.data.rows ?? []).map((r) => ({
        key: r.keys?.[0] ?? '',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));
    };

    const today = todayIst();
    const daily = await query({ startDate: addDays(today, -GSC_DAILY_LOOKBACK_DAYS), endDate: today }, ['date'], 25000);
    if (!daily.length) throw new Error('Search Console returned no data for this site');
    const dataUpTo = daily.reduce((max, r) => (r.key > max ? r.key : max), daily[0].key);

    const reports: StoredReport[] = [];
    for (const rangeDays of RANGE_DAYS) {
      const ranges = periodRanges(dataUpTo, rangeDays);
      for (const period of ['current', 'previous'] as const) {
        const range = ranges[period];
        const [totals] = await query(range, [], 1);
        reports.push({
          source: 'GSC', report: 'totals', rangeDays, period, range,
          rows: { clicks: totals?.clicks ?? 0, impressions: totals?.impressions ?? 0, ctr: totals?.ctr ?? 0, position: totals?.position ?? 0 },
        });
      }
      const range = ranges.current;
      const [queries, pages] = await Promise.all([
        query(range, ['query'], GSC_QUERY_FETCH_LIMIT),
        query(range, ['page'], TOP_GSC_ROWS),
      ]);
      const byClicks = [...queries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
      const current = (report: string, rows: unknown): StoredReport => ({ source: 'GSC', report, rangeDays, period: 'current', range, rows });
      reports.push(
        current('daily', daily.filter((r) => r.key >= range.startDate && r.key <= range.endDate).sort((a, b) => a.key.localeCompare(b.key))),
        current('queries', byClicks.slice(0, TOP_GSC_ROWS)),
        current('pages', pages),
        current('easyWins', pickEasyWins(queries, rangeDays)),
      );
    }
    return { dataUpTo, reports };
  }

  // ── Dashboard read ───────────────────────────────────────────────────────

  async getSummary(rangeDays: RangeDays) {
    const [rows, lastSync, lastGa4Ok, lastGscOk] = await Promise.all([
      this.prisma.webAnalyticsReport.findMany({ where: { rangeDays } }),
      this.prisma.webAnalyticsSyncLog.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.webAnalyticsSyncLog.findFirst({ where: { ga4Ok: true }, orderBy: { startedAt: 'desc' }, select: { finishedAt: true } }),
      this.prisma.webAnalyticsSyncLog.findFirst({ where: { gscOk: true }, orderBy: { startedAt: 'desc' }, select: { finishedAt: true, gscDataUpTo: true } }),
    ]);
    const find = (source: string, report: string, period: Period = 'current') =>
      rows.find((r) => r.source === source && r.report === report && r.period === period);
    const withRange = (r: ReturnType<typeof find>) => (r ? { startDate: r.startDate, endDate: r.endDate, ...(r.rows as object) } : null);

    // Average engagement time per active user — GA4's own definition.
    const ga4Totals = (period: Period) => {
      const r = withRange(find('GA4', 'totals', period)) as any;
      if (!r) return null;
      return { ...r, avgEngagementSeconds: r.users > 0 ? r.engagementSeconds / r.users : 0 };
    };
    const ga4Current = ga4Totals('current');
    const gscCurrent = withRange(find('GSC', 'totals'));

    return {
      configured: isWebAnalyticsConfigured(),
      rangeDays,
      ga4: ga4Current
        ? {
            current: ga4Current,
            previous: ga4Totals('previous'),
            ecommerce: { current: find('GA4', 'ecommerce')?.rows ?? null, previous: find('GA4', 'ecommerce', 'previous')?.rows ?? null },
            productPages: find('GA4', 'productPages')?.rows ?? [],
            channels: find('GA4', 'channels')?.rows ?? [],
            sources: find('GA4', 'sources')?.rows ?? [],
            devices: find('GA4', 'devices')?.rows ?? [],
            cities: find('GA4', 'cities')?.rows ?? [],
            regions: find('GA4', 'regions')?.rows ?? [],
            syncedAt: find('GA4', 'totals')?.syncedAt ?? null,
          }
        : null,
      gsc: gscCurrent
        ? {
            current: gscCurrent,
            previous: withRange(find('GSC', 'totals', 'previous')),
            daily: find('GSC', 'daily')?.rows ?? [],
            queries: find('GSC', 'queries')?.rows ?? [],
            pages: find('GSC', 'pages')?.rows ?? [],
            easyWins: find('GSC', 'easyWins')?.rows ?? [],
            easyWinRule: { minPosition: EASY_WIN_MIN_POSITION, maxPosition: EASY_WIN_MAX_POSITION, minImpressions: EASY_WIN_MIN_IMPRESSIONS_PER_DAY * rangeDays },
            dataUpTo: lastGscOk?.gscDataUpTo ?? gscCurrent.endDate,
            syncedAt: find('GSC', 'totals')?.syncedAt ?? null,
          }
        : null,
      lastSync: lastSync
        ? { status: lastSync.status, trigger: lastSync.trigger, startedAt: lastSync.startedAt, finishedAt: lastSync.finishedAt, error: lastSync.error }
        : null,
      lastSuccessfulSync: { ga4: lastGa4Ok?.finishedAt ?? null, gsc: lastGscOk?.finishedAt ?? null },
      syncing: this.syncing,
    };
  }
}

// Google API errors carry the useful text in response.data.error.message.
function googleErrorMessage(err: any): string {
  return String(err?.response?.data?.error?.message ?? err?.errors?.[0]?.message ?? err?.message ?? err).slice(0, 1000);
}
