// backend/src/certificate-generator/imposition.ts
//
// Pure geometry for imposing certificates onto a print sheet — no I/O, no
// Prisma — so it can be exercised with a plain Node script without booting
// the Nest app or Prisma client. Mirrors the margin/gap approach already
// used by computeSlotGeometry() in ../sheet-layout/sheet-layout.service.ts,
// generalized to a single repeating certificate size instead of fixed named
// slot types, and expressed in inches (the physical unit) rather than
// pixels — pixel/point conversion happens only where pdfkit needs it
// (see render.ts).

export interface ImpositionInput {
  sheetWidthIn: number;
  sheetHeightIn: number;
  certWidthIn: number;
  certHeightIn: number;
  marginIn: number;
  gapIn: number;
  allowRotation: boolean;
}

export interface ImpositionSlot {
  col: number;
  row: number;
  xIn: number;
  yIn: number;
}

export interface ImpositionResult {
  cols: number;
  rows: number;
  perSheet: number;
  /** true if certificates had to be rotated 90° to maximize how many fit */
  rotated: boolean;
  /** on-sheet footprint of each slot — equals certWidthIn×certHeightIn
   *  swapped when rotated is true */
  placedWidthIn: number;
  placedHeightIn: number;
  /** row-major order (left-to-right, top-to-bottom) — this is the order
   *  certificates must be assigned to slots so sheet 1 gets rows 1..N in
   *  their original sequence, never reordered */
  slots: ImpositionSlot[];
}

function fitGrid(
  usableWIn: number,
  usableHIn: number,
  wIn: number,
  hIn: number,
  gapIn: number,
): { cols: number; rows: number } {
  if (wIn <= 0 || hIn <= 0 || usableWIn <= 0 || usableHIn <= 0) return { cols: 0, rows: 0 };
  const cols = Math.floor((usableWIn + gapIn) / (wIn + gapIn));
  const rows = Math.floor((usableHIn + gapIn) / (hIn + gapIn));
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

function buildSlots(cols: number, rows: number, wIn: number, hIn: number, marginIn: number, gapIn: number): ImpositionSlot[] {
  const slots: ImpositionSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ col: c, row: r, xIn: marginIn + c * (wIn + gapIn), yIn: marginIn + r * (hIn + gapIn) });
    }
  }
  return slots;
}

export function computeImposition(input: ImpositionInput): ImpositionResult {
  const usableWIn = input.sheetWidthIn - 2 * input.marginIn;
  const usableHIn = input.sheetHeightIn - 2 * input.marginIn;

  const normal = fitGrid(usableWIn, usableHIn, input.certWidthIn, input.certHeightIn, input.gapIn);
  const normalCount = normal.cols * normal.rows;

  let rotatedGrid = { cols: 0, rows: 0 };
  let rotatedCount = 0;
  if (input.allowRotation) {
    rotatedGrid = fitGrid(usableWIn, usableHIn, input.certHeightIn, input.certWidthIn, input.gapIn);
    rotatedCount = rotatedGrid.cols * rotatedGrid.rows;
  }

  // Ties prefer the non-rotated layout (simpler to read on the sheet).
  const useRotated = rotatedCount > normalCount;
  const chosen = useRotated ? rotatedGrid : normal;
  const placedWidthIn = useRotated ? input.certHeightIn : input.certWidthIn;
  const placedHeightIn = useRotated ? input.certWidthIn : input.certHeightIn;

  return {
    cols: chosen.cols,
    rows: chosen.rows,
    perSheet: chosen.cols * chosen.rows,
    rotated: useRotated,
    placedWidthIn,
    placedHeightIn,
    slots: buildSlots(chosen.cols, chosen.rows, placedWidthIn, placedHeightIn, input.marginIn, input.gapIn),
  };
}

export function computeSheetCount(totalCerts: number, perSheet: number): number {
  if (perSheet <= 0 || totalCerts <= 0) return 0;
  return Math.ceil(totalCerts / perSheet);
}
