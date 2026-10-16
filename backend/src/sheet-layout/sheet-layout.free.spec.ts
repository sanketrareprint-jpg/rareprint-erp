// Free-layout sheet export: layers land at their exact inch position/size
// at 600 DPI, stack bottom-first, and parts hanging off the sheet are clipped.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp');
import { SheetLayoutService } from './sheet-layout.service';
import { SheetLayoutController } from './sheet-layout.controller';

const DPI = 600;
const solid = (r: number, g: number, b: number) =>
  sharp({
    create: { width: 40, height: 60, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();

async function pixel(jpeg: Buffer, xIn: number, yIn: number) {
  const { data } = await sharp(jpeg)
    .extract({
      left: Math.round(xIn * DPI),
      top: Math.round(yIn * DPI),
      width: 1,
      height: 1,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}
const near = (px: number[], rgb: number[]) =>
  px.every((v, i) => Math.abs(v - rgb[i]) < 30);

describe('SheetLayoutService.assembleFreeSheet', () => {
  jest.setTimeout(120_000);

  it('places, stacks and clips layers at 600 DPI', async () => {
    const svc = new SheetLayoutService();
    const red = await solid(255, 0, 0);
    const blue = await solid(0, 0, 255);
    const green = await solid(0, 160, 0);
    const out = await svc.assembleFreeSheet('18x23', [
      { image: red, xIn: 1, yIn: 1, wIn: 4, hIn: 6 },
      { image: blue, xIn: 3, yIn: 3, wIn: 2, hIn: 2 }, // on top of red
      { image: green, xIn: 21, yIn: 16, wIn: 4, hIn: 4 }, // hangs off right/bottom edge
    ]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.density]).toEqual([
      23 * DPI,
      18 * DPI,
      DPI,
    ]);

    expect(near(await pixel(out, 1.5, 1.5), [255, 0, 0])).toBe(true); // red
    expect(near(await pixel(out, 4, 4), [0, 0, 255])).toBe(true); // blue above red
    expect(near(await pixel(out, 4.9, 6.9), [255, 0, 0])).toBe(true); // red inside its 4×6 box
    expect(near(await pixel(out, 5.1, 2), [255, 255, 255])).toBe(true); // just right of red = white
    expect(near(await pixel(out, 22.9, 17.9), [0, 160, 0])).toBe(true); // clipped green still drawn
    expect(near(await pixel(out, 20.9, 15.9), [255, 255, 255])).toBe(true);
  });

  it('skips a layer that is completely off the sheet', async () => {
    const svc = new SheetLayoutService();
    const out = await svc.assembleFreeSheet('19x25', [
      { image: await solid(255, 0, 0), xIn: 30, yIn: 2, wIn: 3, hIn: 3 },
    ]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([25 * DPI, 19 * DPI]);
  });
});

describe('SheetLayoutController.assembleFreeSheet', () => {
  const file = (name: string) =>
    ({ originalname: name, buffer: Buffer.from('x') }) as Express.Multer.File;
  const res = () =>
    ({
      set: jest.fn(),
      end: jest.fn(),
    }) as unknown as import('express').Response;

  it('passes layers to the service bottom-first by their layer_<i> index', async () => {
    type Layer = { index: number; xIn: number };
    const svc = {
      assembleFreeSheet: jest
        .fn<Promise<Buffer>, [string, Layer[]]>()
        .mockResolvedValue(Buffer.from('jpg')),
    };
    const ctrl = new SheetLayoutController(
      svc as unknown as SheetLayoutService,
    );
    const placements = JSON.stringify([
      { xIn: 1, yIn: 1, wIn: 2, hIn: 2 },
      { xIn: 5, yIn: 5, wIn: 3, hIn: 4 },
    ]);
    await ctrl.assembleFreeSheet(
      '18x23',
      placements,
      [file('layer_1.jpg'), file('layer_0.jpg')],
      res(),
    );
    const [size, layers] = svc.assembleFreeSheet.mock.calls[0];
    expect(size).toBe('18x23');
    expect(layers.map((l) => [l.index, l.xIn])).toEqual([
      [0, 1],
      [1, 5],
    ]);
  });

  it.each([
    [
      'unknown sheet size',
      '20x30',
      '[{"xIn":0,"yIn":0,"wIn":1,"hIn":1}]',
      ['layer_0.jpg'],
    ],
    ['no files', '18x23', '[]', []],
    ['bad JSON', '18x23', 'not json', ['layer_0.jpg']],
    ['missing placement', '18x23', '[]', ['layer_0.jpg']],
    [
      'zero width',
      '18x23',
      '[{"xIn":0,"yIn":0,"wIn":0,"hIn":1}]',
      ['layer_0.jpg'],
    ],
    [
      'absurd size',
      '18x23',
      '[{"xIn":0,"yIn":0,"wIn":500,"hIn":1}]',
      ['layer_0.jpg'],
    ],
  ])('rejects %s', async (_label, size, placements, names) => {
    const svc = { assembleFreeSheet: jest.fn() };
    const ctrl = new SheetLayoutController(
      svc as unknown as SheetLayoutService,
    );
    await expect(
      ctrl.assembleFreeSheet(size, placements, names.map(file), res()),
    ).rejects.toThrow();
    expect(svc.assembleFreeSheet).not.toHaveBeenCalled();
  });
});
