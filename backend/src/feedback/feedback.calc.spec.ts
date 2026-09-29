import {
  agentLeadTemplateParams,
  hasSalesLead,
  templateText,
  validateFeedback,
  type FeedbackBody,
} from './feedback.calc';

const items = [
  { id: 'item-1', productName: 'Visiting Card', quantity: 1000 },
  { id: 'item-2', productName: 'Sticker', quantity: 500 },
];

function body(overrides: FeedbackBody = {}): FeedbackBody {
  return {
    overallRating: 4,
    productRatings: { 'item-1': 5, 'item-2': 4 },
    serviceRating: 4,
    deliveryRating: 3,
    improvement: '  Faster delivery  ',
    wouldRecommend: 'NO',
    needsMore: false,
    willRateOnGoogle: true,
    ...overrides,
  };
}

function valid(overrides: FeedbackBody = {}) {
  const result = validateFeedback(body(overrides), items);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('validateFeedback', () => {
  it('accepts a complete answer set and snapshots each product rating', () => {
    const value = valid();
    expect(value.productRatings).toEqual([
      {
        orderItemId: 'item-1',
        productName: 'Visiting Card',
        quantity: 1000,
        rating: 5,
      },
      {
        orderItemId: 'item-2',
        productName: 'Sticker',
        quantity: 500,
        rating: 4,
      },
    ]);
    expect(value.improvement).toBe('Faster delivery');
  });

  it.each([0, 6, 3.5, '4', null])('rejects star rating %p', (rating) => {
    expect(validateFeedback(body({ overallRating: rating }), items).ok).toBe(
      false,
    );
    expect(validateFeedback(body({ serviceRating: rating }), items).ok).toBe(
      false,
    );
    expect(validateFeedback(body({ deliveryRating: rating }), items).ok).toBe(
      false,
    );
  });

  it('requires a rating for every product on the order', () => {
    const result = validateFeedback(
      body({ productRatings: { 'item-1': 5 } }),
      items,
    );
    expect(result).toEqual({
      ok: false,
      error: 'Rating (1–5) is required for Sticker',
    });
  });

  it('rejects an unknown recommend answer', () => {
    expect(validateFeedback(body({ wouldRecommend: 'SURE' }), items).ok).toBe(
      false,
    );
  });

  it('keeps referral contact only when the answer is YES', () => {
    const yes = valid({
      wouldRecommend: 'YES',
      referralName: 'Suresh',
      referralPhone: '9876543210',
    });
    expect([yes.referralName, yes.referralPhone]).toEqual([
      'Suresh',
      '9876543210',
    ]);
    const maybe = valid({
      wouldRecommend: 'MAYBE',
      referralName: 'Suresh',
      referralPhone: '9876543210',
    });
    expect([maybe.referralName, maybe.referralPhone]).toEqual([null, null]);
  });

  it('allows YES without a contact, but not a phone without a name or a short phone', () => {
    expect(valid({ wouldRecommend: 'YES' }).referralName).toBeNull();
    expect(
      validateFeedback(
        body({ wouldRecommend: 'YES', referralPhone: '9876543210' }),
        items,
      ).ok,
    ).toBe(false);
    expect(
      validateFeedback(
        body({
          wouldRecommend: 'YES',
          referralName: 'Suresh',
          referralPhone: '98765',
        }),
        items,
      ).ok,
    ).toBe(false);
  });

  it('requires a comment when the customer needs something else, and drops it otherwise', () => {
    expect(
      validateFeedback(body({ needsMore: true, requirementNote: '  ' }), items)
        .ok,
    ).toBe(false);
    expect(
      valid({ needsMore: true, requirementNote: '500 stickers' })
        .requirementNote,
    ).toBe('500 stickers');
    expect(
      valid({ needsMore: false, requirementNote: '500 stickers' })
        .requirementNote,
    ).toBeNull();
  });

  it('requires the yes/no answers to be real booleans', () => {
    expect(validateFeedback(body({ needsMore: 'no' }), items).ok).toBe(false);
    expect(
      validateFeedback(body({ willRateOnGoogle: undefined }), items).ok,
    ).toBe(false);
  });
});

describe('hasSalesLead', () => {
  it('is false with no referral and no extra requirement', () => {
    expect(hasSalesLead(valid({ wouldRecommend: 'YES' }))).toBe(false);
    expect(hasSalesLead(valid())).toBe(false);
  });

  it('is true for a referral (Q6) or an extra requirement (Q7)', () => {
    expect(
      hasSalesLead(valid({ wouldRecommend: 'YES', referralName: 'Suresh' })),
    ).toBe(true);
    expect(
      hasSalesLead(valid({ needsMore: true, requirementNote: '500 stickers' })),
    ).toBe(true);
  });
});

describe('agentLeadTemplateParams', () => {
  it('builds the 8 single-line template variables', () => {
    const params = agentLeadTemplateParams({
      agentName: 'Priya',
      customerName: 'Ramesh Traders',
      customerPhone: '9123456789',
      orderNo: 'RP-1001',
      feedback: valid({
        wouldRecommend: 'YES',
        referralName: 'Suresh',
        referralPhone: '9876543210',
        needsMore: true,
        requirementNote: '500 stickers\nurgent',
      }),
    });
    expect(params).toEqual([
      'Priya',
      'Ramesh Traders',
      '9123456789',
      'RP-1001',
      'Overall 4/5 | Products: Visiting Card 5/5, Sticker 4/5 | Service 4/5 | Delivery 3/5 | Will rate on Google: Yes',
      'Suresh - 9876543210',
      '500 stickers urgent',
      'Faster delivery',
    ]);
    params.forEach((p) => expect(p).not.toMatch(/[\n\t]/));
  });

  it('never sends an empty variable', () => {
    expect(templateText('')).toBe('-');
    expect(templateText(null)).toBe('-');
  });
});
