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
    { kind: 'shape', side: 'front', x: 0.35, y: 0.8, w: 3.55, h: 4.75, fill: '#ffffff', stroke: '#e2e8f0', radius: 0.16 },
    { kind: 'shape', side: 'front', x: 0.52, y: 1.02, w: 0.72, h: 0.72, fill: palette.accent, stroke: palette.accent, radius: 0.12 },
    { kind: 'text', side: 'front', x: 1.38, y: 1.03, w: 2.35, h: 0.42, text: form.header ?? '', fill: palette.text, fontFamily: detectFont(form.header), fontSize: 0.25, fontWeight: 800 },
    { kind: 'text', side: 'front', x: 1.39, y: 1.43, w: 2.3, h: 0.28, text: form.subheader ?? '', fill: palette.muted, fontFamily: detectFont(form.subheader), fontSize: 0.135, fontWeight: 700 },
    { kind: 'shape', side: 'front', x: 0.58, y: 2.1, w: 3.1, h: 1.25, fill: `${palette.accent}22`, stroke: `${palette.accent}55`, radius: 0.16 },
    { kind: 'text', side: 'front', x: 0.78, y: 2.32, w: 2.68, h: 0.8, text: form.body ?? '', fill: palette.text, fontFamily: detectFont(form.body), fontSize: 0.155, fontWeight: 700 },
    { kind: 'text', side: 'front', x: 0.62, y: 3.82, w: 1.1, h: 0.25, text: form.bulletHeading ?? '', fill: palette.accent, fontFamily: detectFont(form.bulletHeading), fontSize: 0.16, fontWeight: 800 },
    { kind: 'text', side: 'front', x: 0.75, y: 4.1, w: 2.9, h: 0.62, text: String(form.bullets ?? '').split('\n').map((b) => `› ${b}`).join('\n'), fill: palette.text, fontFamily: detectFont(form.bullets), fontSize: 0.12, fontWeight: 700 },
    { kind: 'text', side: 'front', x: 0.62, y: 5.05, w: 3.1, h: 0.35, text: [form.mobile1, form.mobile2, form.mobile3, form.address1, form.address2].filter(Boolean).join('  |  '), fill: palette.text, fontFamily: detectFont(`${form.address1 ?? ''}${form.address2 ?? ''}`), fontSize: 0.095, fontWeight: 700 },
    { kind: 'shape', side: 'back', x: 4.62, y: 0.95, w: 3.55, h: 4.55, fill: '#ffffff', stroke: '#e2e8f0', radius: 0.16 },
    { kind: 'text', side: 'back', x: 6.4, y: 1.28, w: 2.7, h: 0.38, text: form.backsideHeading ?? '', fill: palette.text, fontFamily: detectFont(form.backsideHeading), fontSize: 0.24, fontWeight: 800, align: 'middle' },
    { kind: 'text', side: 'back', x: 4.98, y: 2.0, w: 2.95, h: 1.05, text: String(form.backsideBullets ?? '').split('\n').map((b, i) => `${i + 1}. ${b}`).join('\n'), fill: palette.text, fontFamily: detectFont(form.backsideBullets), fontSize: 0.16, fontWeight: 700 },
  ];
}

function buildPrompt(input: any) {
  const form = input?.form ?? {};
  return [
    `Create a premium editable envelope design layout for ${form.header ?? 'business envelope'}.`,
    'Product: envelope. Close size 4.25 x 5.5 inch. Open size 8.5 x 5.5 inch.',
    'Top flap 0.5 inch, bottom pasting 0.5 inch, centre-pasted back split: left half and right half must remain visually balanced.',
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
    'Return editable layout objects only. Keep all objects inside safe margins. Use bold Google-font-friendly typography, including Devanagari fonts for Hindi/Marathi text.',
  ].join('\n');
}

function normalizeElements(value: unknown): DesignElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      kind: item.kind === 'shape' ? 'shape' : 'text',
      side: item.side === 'back' ? 'back' : 'front',
      x: clamp(item.x, 0.05, 8.2, 0.8),
      y: clamp(item.y, 0.05, 6.2, 1),
      w: clamp(item.w, 0.2, 4, 2.5),
      h: clamp(item.h, 0.1, 4.5, 0.5),
      text: typeof item.text === 'string' ? item.text : undefined,
      fill: typeof item.fill === 'string' ? item.fill : '#0f172a',
      stroke: typeof item.stroke === 'string' ? item.stroke : undefined,
      fontFamily: typeof item.fontFamily === 'string' ? item.fontFamily : undefined,
      fontSize: clamp(item.fontSize, 0.07, 0.6, 0.16),
      fontWeight: clamp(item.fontWeight, 400, 900, 700),
      align: item.align === 'middle' || item.align === 'end' ? item.align : 'start',
      radius: clamp(item.radius, 0, 0.4, 0.12),
    }));
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
