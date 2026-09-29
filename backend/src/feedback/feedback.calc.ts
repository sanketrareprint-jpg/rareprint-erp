// backend/src/feedback/feedback.calc.ts
//
// Pure-function core of the Feedback module: input validation, the "does this
// feedback carry a sales lead" rule, and the WhatsApp template parameters.
// Kept dependency-free (no Prisma/Nest) so it can be unit tested directly,
// same pattern as complaints.calc.ts.

// Delivered orders older than this are not offered for a feedback call.
export const FEEDBACK_WINDOW_DAYS = 60;

export const RECOMMEND_OPTIONS = ['YES', 'MAYBE', 'NO'] as const;
export type RecommendOption = (typeof RECOMMEND_OPTIONS)[number];

export interface FeedbackOrderItem {
  id: string;
  productName: string;
  quantity: number;
}

export interface ProductRating {
  orderItemId: string;
  productName: string;
  quantity: number;
  rating: number;
}

export interface ValidFeedback {
  overallRating: number;
  productRatings: ProductRating[];
  serviceRating: number;
  deliveryRating: number;
  improvement: string | null;
  wouldRecommend: RecommendOption;
  referralName: string | null;
  referralPhone: string | null;
  needsMore: boolean;
  requirementNote: string | null;
  willRateOnGoogle: boolean;
}

// referralPhone must already be reduced to digits by the caller
// (OrdersService's sanitizePhone), so this file stays dependency-free.
export interface FeedbackBody {
  overallRating?: unknown;
  productRatings?: unknown;
  serviceRating?: unknown;
  deliveryRating?: unknown;
  improvement?: unknown;
  wouldRecommend?: unknown;
  referralName?: unknown;
  referralPhone?: unknown;
  needsMore?: unknown;
  requirementNote?: unknown;
  willRateOnGoogle?: unknown;
}

function isStarRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function trimmedOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function validateFeedback(
  body: FeedbackBody,
  items: FeedbackOrderItem[],
): { ok: true; value: ValidFeedback } | { ok: false; error: string } {
  if (!isStarRating(body.overallRating))
    return { ok: false, error: 'Overall experience rating (1–5) is required' };
  if (!isStarRating(body.serviceRating))
    return { ok: false, error: 'Customer service rating (1–5) is required' };
  if (!isStarRating(body.deliveryRating))
    return { ok: false, error: 'Delivery time rating (1–5) is required' };

  const given =
    body.productRatings && typeof body.productRatings === 'object'
      ? (body.productRatings as Record<string, unknown>)
      : {};
  const productRatings: ProductRating[] = [];
  for (const item of items) {
    const rating = given[item.id];
    if (!isStarRating(rating))
      return {
        ok: false,
        error: `Rating (1–5) is required for ${item.productName}`,
      };
    productRatings.push({
      orderItemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      rating,
    });
  }

  const wouldRecommend = body.wouldRecommend;
  if (
    typeof wouldRecommend !== 'string' ||
    !(RECOMMEND_OPTIONS as readonly string[]).includes(wouldRecommend)
  ) {
    return {
      ok: false,
      error: 'Please answer "Would you recommend Rareprint to others?"',
    };
  }

  // Referral contact is only kept when the customer said Yes.
  let referralName: string | null = null;
  let referralPhone: string | null = null;
  if (wouldRecommend === 'YES') {
    referralName = trimmedOrNull(body.referralName);
    referralPhone = trimmedOrNull(body.referralPhone);
    if (referralPhone && !/^\d{10}$/.test(referralPhone)) {
      return { ok: false, error: 'Referral phone number must be 10 digits' };
    }
    if (referralPhone && !referralName)
      return { ok: false, error: "Please enter the referred person's name" };
  }

  if (typeof body.needsMore !== 'boolean')
    return { ok: false, error: 'Please answer "Do you need anything else?"' };
  const requirementNote = body.needsMore
    ? trimmedOrNull(body.requirementNote)
    : null;
  if (body.needsMore && !requirementNote)
    return { ok: false, error: 'Please describe what else the customer needs' };

  if (typeof body.willRateOnGoogle !== 'boolean') {
    return {
      ok: false,
      error: 'Please answer "Would you rate our service on Google?"',
    };
  }

  return {
    ok: true,
    value: {
      overallRating: body.overallRating,
      productRatings,
      serviceRating: body.serviceRating,
      deliveryRating: body.deliveryRating,
      improvement: trimmedOrNull(body.improvement),
      wouldRecommend: wouldRecommend as RecommendOption,
      referralName,
      referralPhone,
      needsMore: body.needsMore,
      requirementNote,
      willRateOnGoogle: body.willRateOnGoogle,
    },
  };
}

// The sales agent is messaged only when Q6 (referral) or Q7 (extra
// requirement) actually carries something to follow up on.
export function hasSalesLead(feedback: ValidFeedback): boolean {
  return Boolean(
    feedback.referralName || feedback.referralPhone || feedback.requirementNote,
  );
}

// WhatsApp template variables may not contain newlines/tabs or be empty
// (Meta rejects the send), so every value is flattened to one line.
export function templateText(value: string | null | undefined): string {
  const flat = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat || '-';
}

export function ratingsSummary(feedback: ValidFeedback): string {
  const products = feedback.productRatings
    .map((p) => `${p.productName} ${p.rating}/5`)
    .join(', ');
  return templateText(
    `Overall ${feedback.overallRating}/5 | Products: ${products || '-'} | Service ${feedback.serviceRating}/5 | ` +
      `Delivery ${feedback.deliveryRating}/5 | Will rate on Google: ${feedback.willRateOnGoogle ? 'Yes' : 'No'}`,
  );
}

// Body variables of the agent lead template, in order:
// {{1}} agent name, {{2}} customer name, {{3}} customer phone, {{4}} order
// number, {{5}} ratings summary, {{6}} referral, {{7}} extra requirement,
// {{8}} what we can improve.
export function agentLeadTemplateParams(params: {
  agentName: string;
  customerName: string;
  customerPhone: string | null;
  orderNo: string;
  feedback: ValidFeedback;
}): string[] {
  const { feedback } = params;
  const referral =
    feedback.referralName || feedback.referralPhone
      ? [feedback.referralName, feedback.referralPhone]
          .filter(Boolean)
          .join(' - ')
      : 'None';
  return [
    templateText(params.agentName),
    templateText(params.customerName),
    templateText(params.customerPhone),
    templateText(params.orderNo),
    ratingsSummary(feedback),
    templateText(referral),
    templateText(feedback.requirementNote ?? 'None'),
    templateText(feedback.improvement),
  ];
}
