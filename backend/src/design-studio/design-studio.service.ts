import { Injectable } from '@nestjs/common';

type DesignElement = {
  kind: 'text' | 'shape';
  side: 'front' | 'back';
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fill: string;
  stroke?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: 'start' | 'middle' | 'end';
  radius?: number;
};

const TEMPLATE = {
  clean: { accent: '#2563eb', text: '#0f172a', muted: '#64748b' },
  premium: { accent: '#b7791f', text: '#171717', muted: '#7c6f57' },
  education: { accent: '#0f766e', text: '#12324a', muted: '#527084' },
  festival: { accent: '#dc2626', text: '#3b1d0f', muted: '#9a3412' },
};

function detectFont(text = '') {
  return /[\u0900-\u097F]/.test(text) ? 'Noto Sans Devanagari' : 'Noto Sans';
}

function clamp(n: unknown, min: number, max: number, fallback: number) {
  const value = Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function fallbackElements(input: any): DesignElement[] {
  const form = input?.form ?? {};
  const palette = TEMPLATE[input?.template as keyof typeof TEMPLATE] ?? TEMPLATE.clean;
  return [
    { kind: 'shape', side: 'front', x: 2.25, y: 0.82, w: 4.0, h: 4.8, fill: '#ffffff', stroke: '#e2e8f0', radius: 0.04 },
    { kind: 'shape', side: 'front', x: 2.35, y: 3.45, w: 3.8, h: 0.7, fill: palette.accent, stroke: palette.accent, radius: 0.02 },
    { kind: 'text', side: 'front', x: 4.25, y: 1.18, w: 3.4, h: 0.5, text: form.header ?? '', fill: palette.text, fontFamily: detectFont(form.header), fontSize: 0.34, fontWeight: 800, align: 'middle' },
    { kind: 'text', side: 'front', x: 4.25, y: 1.78, w: 3.5, h: 0.55, text: form.subheader ?? '', fill: palette.muted, fontFamily: detectFont(form.subheader), fontSize: 0.18, fontWeight: 800, align: 'middle' },
    { kind: 'text', side: 'front', x: 4.25, y: 3.56, w: 3.3, h: 0.34, text: form.body ?? '', fill: '#ffffff', fontFamily: detectFont(form.body), fontSize: 0.18, fontWeight: 800, align: 'middle' },
    { kind: 'shape', side: 'front', x: 2.25, y: 5.62, w: 4.0, h: 0.45, fill: palette.accent, stroke: palette.accent, radius: 0.02 },
    { kind: 'text', side: 'front', x: 4.25, y: 5.72, w: 3.5, h: 0.22, text: [form.mobile1, form.mobile2, form.mobile3, form.address1, form.address2].filter(Boolean).join('  |  '), fill: '#ffffff', fontFamily: detectFont(`${form.address1 ?? ''}${form.address2 ?? ''}`), fontSize: 0.12, fontWeight: 800, align: 'middle' },
    { kind: 'shape', side: 'back', x: 0.18, y: 0.82, w: 1.75, h: 4.8, fill: '#ffffff', stroke: '#e2e8f0', radius: 0.04 },
    { kind: 'text', side: 'back', x: 1.05, y: 1.35, w: 1.5, h: 0.48, text: form.header ?? '', fill: palette.text, fontFamily: detectFont(form.header), fontSize: 0.23, fontWeight: 800, align: 'middle' },
    { kind: 'text', side: 'back', x: 1.05, y: 2.5, w: 1.55, h: 0.8, text: [form.address1, form.address2].filter(Boolean).join('\n'), fill: palette.text, fontFamily: detectFont(`${form.address1 ?? ''}${form.address2 ?? ''}`), fontSize: 0.12, fontWeight: 700, align: 'middle' },
    { kind: 'shape', side: 'back', x: 0.38, y: 4.1, w: 1.35, h: 0.28, fill: palette.accent, stroke: palette.accent, radius: 0.12 },
    { kind: 'text', side: 'back', x: 1.05, y: 4.15, w: 1.2, h: 0.18, text: form.mobile1 ?? '', fill: '#ffffff', fontFamily: 'Noto Sans', fontSize: 0.13, fontWeight: 800, align: 'middle' },
    { kind: 'shape', side: 'back', x: 6.58, y: 0.82, w: 1.75, h: 4.8, fill: '#ffffff', stroke: '#e2e8f0', radius: 0.04 },
    { kind: 'text', side: 'back', x: 7.45, y: 2.62, w: 1.35, h: 0.45, text: form.backsideHeading ?? '', fill: palette.text, fontFamily: detectFont(form.backsideHeading), fontSize: 0.16, fontWeight: 800, align: 'middle' },
    { kind: 'text', side: 'back', x: 7.45, y: 3.35, w: 1.35, h: 1.2, text: String(form.backsideBullets ?? '').split('\n').map((b) => `• ${b}`).join('\n'), fill: palette.text, fontFamily: detectFont(form.backsideBullets), fontSize: 0.12, fontWeight: 800, align: 'middle' },
  ];
}

function buildPrompt(input: any) {
  const form = input?.form ?? {};
  return [
    `Create a premium editable envelope design layout for ${form.header ?? 'business envelope'}.`,
    'Product: envelope. Close size 4.25 x 5.5 inch. Open size 8.5 x 5.5 inch.',
    'Open layout panels: left back half is x=0 to 2.125, front panel is x=2.125 to 6.375, right back half is x=6.375 to 8.5.',
    'Top flap 0.5 inch, bottom pasting 0.5 inch. For backside centre-pasting, split all back artwork half-half on the two outside panels only, like a retail pharmacy envelope reference: left wing has logo/contact/address, right wing has product/service blocks.',
    `Style/template: ${input?.template ?? 'clean'}.`,
    `Header: ${form.header ?? ''}`,
    `Subheader: ${form.subheader ?? ''}`,
    `Mobiles: ${[form.mobile1, form.mobile2, form.mobile3].filter(Boolean).join(', ')}`,
    `Address: ${[form.address1, form.address2].filter(Boolean).join(', ')}`,
    `Body: ${form.body ?? ''}`,
    `Front bullets heading: ${form.bulletHeading ?? ''}`,
    `Front bullets: ${form.bullets ?? ''}`,
    `Back heading: ${form.backsideHeading ?? ''}`,
    `Back bullets: ${form.backsideBullets ?? ''}`,
    'Return editable layout objects only. Keep front objects inside x=2.25 to 6.25. Keep back objects only in x=0.15 to 1.95 or x=6.55 to 8.35. Use bold Google-font-friendly typography, including Devanagari fonts for Hindi/Marathi text.',
  ].join('\n');
}

function normalizeElements(value: unknown): DesignElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const side = item.side === 'back' ? 'back' : 'front';
      const rawW = clamp(item.w, 0.2, side === 'front' ? 4 : 1.75, side === 'front' ? 2.5 : 1.25);
      const rawX = Number(item.x);
      let x = side === 'front'
        ? clamp(rawX, 2.2, 6.3 - rawW, 2.6)
        : clamp(rawX, 0.15, 8.3 - rawW, 0.5);
      if (side === 'back' && x > 2 && x < 6.35) {
        x = x < 4.25 ? 0.45 : 6.65;
      }
      return {
        kind: item.kind === 'shape' ? 'shape' : 'text',
        side,
        x,
        y: clamp(item.y, 0.65, 6.05, 1),
        w: rawW,
        h: clamp(item.h, 0.1, 4.5, 0.5),
        text: typeof item.text === 'string' ? item.text : undefined,
        fill: typeof item.fill === 'string' ? item.fill : '#0f172a',
        stroke: typeof item.stroke === 'string' ? item.stroke : undefined,
        fontFamily: typeof item.fontFamily === 'string' ? item.fontFamily : undefined,
        fontSize: clamp(item.fontSize, 0.07, 0.6, 0.16),
        fontWeight: clamp(item.fontWeight, 400, 900, 700),
        align: item.align === 'middle' || item.align === 'end' ? item.align : 'start',
        radius: clamp(item.radius, 0, 0.4, 0.12),
      };
    });
}

@Injectable()
export class DesignStudioService {
  async createEnvelopeLayout(input: any) {
    const prompt = buildPrompt(input);
    const fallback = fallbackElements(input);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { source: 'local', prompt, elements: fallback };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_DESIGN_MODEL ?? 'gpt-4o-mini',
          input: [
            {
              role: 'system',
              content: 'You are a senior print designer. Return only valid JSON for an editable SVG-based envelope editor. No markdown.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'envelope_design_layout',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['elements'],
                properties: {
                  elements: {
                    type: 'array',
                    minItems: 8,
                    maxItems: 24,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['kind', 'side', 'x', 'y', 'w', 'h', 'fill'],
                      properties: {
                        kind: { type: 'string', enum: ['text', 'shape'] },
                        side: { type: 'string', enum: ['front', 'back'] },
                        x: { type: 'number' },
                        y: { type: 'number' },
                        w: { type: 'number' },
                        h: { type: 'number' },
                        text: { type: 'string' },
                        fill: { type: 'string' },
                        stroke: { type: 'string' },
                        fontFamily: { type: 'string' },
                        fontSize: { type: 'number' },
                        fontWeight: { type: 'number' },
                        align: { type: 'string', enum: ['start', 'middle', 'end'] },
                        radius: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
      const data = await response.json();
      const text = data.output_text ?? data.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === 'output_text')?.text;
      const parsed = typeof text === 'string' ? JSON.parse(text) : null;
      const elements = normalizeElements(parsed?.elements);
      return { source: elements.length ? 'openai' : 'local', prompt, elements: elements.length ? elements : fallback };
    } catch {
      return { source: 'local', prompt, elements: fallback };
    }
  }
}
