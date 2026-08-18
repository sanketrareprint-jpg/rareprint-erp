// Indian-numbering (crore/lakh/thousand) number-to-words converter for the
// invoice PDF's "Invoice Amount in Words" line. No npm package for this was
// already present in backend/package.json, and the logic is small/self-
// contained, so it's written here rather than adding a new dependency.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ' ' + ONES[ones] : ''}`;
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

// Converts a non-negative integer into Indian-numbering words (crore / lakh
// / thousand / hundred), e.g. 1234567 -> "Twelve Lakh Thirty Four Thousand
// Five Hundred Sixty Seven".
function integerToWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ').trim();
}

// Renders a rupee amount (can include paise) as "Rupees ... and ... Paise
// Only", matching the standard Indian tax-invoice phrasing. Rounds to the
// nearest paise to avoid floating-point artifacts (e.g. 10388.549999...).
export function amountInWords(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const totalPaise = Math.round(safeAmount * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  const rupeesWords = integerToWords(rupees);
  let result = `Rupees ${rupeesWords}`;
  if (paise > 0) {
    result += ` and ${integerToWords(paise)} Paise`;
  }
  result += ' Only';
  return result;
}
