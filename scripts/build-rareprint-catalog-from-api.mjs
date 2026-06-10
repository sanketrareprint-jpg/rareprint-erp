import { readFile, writeFile } from 'node:fs/promises';

const rawPath = new URL('../frontend/app/web-to-print/rareprint-raw-products.json', import.meta.url);
const outPath = new URL('../frontend/app/web-to-print/rareprint-catalog.json', import.meta.url);

function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#034;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&#215;/g, 'x')
    .replace(/&times;/g, 'x');
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function rupees(minor) {
  const n = Number(minor);
  return Number.isFinite(n) ? n / 100 : 0;
}

function firstNumber(value = '') {
  const match = String(value).replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function inferMoq(item, attributes, category) {
  const short = stripTags(item.short_description);
  const quantities = attributes
    .filter((attr) => /qty|quantity|nos|pcs/i.test(attr.name))
    .flatMap((attr) => attr.terms.map((term) => firstNumber(term.name)).filter(Boolean));
  const moq = firstNumber(short.match(/MOQ:?\s*([\d,]+)/i)?.[1] ?? '');
  if (moq) quantities.push(moq);
  if (quantities.length) return Math.min(...quantities);
  if (category === 'Pen') return 1000;
  if (category === 'Keychain') return 500;
  return 1;
}

const verifiedRateTables = {
  'medicine-pouch': [
    { label: '5,000 pcs', quantity: 5000, price: 4999 },
    { label: '10,000 pcs', quantity: 10000, price: 7999 },
    { label: '20,000 pcs', quantity: 20000, price: 13499 },
    { label: '50,000 pcs', quantity: 50000, price: 31999 },
    { label: '1,00,000 pcs', quantity: 100000, price: 55499 },
  ],
  'medium-medicine-pouch': [
    { label: '5,000 pcs', quantity: 5000, price: 5499 },
    { label: '10,000 pcs', quantity: 10000, price: 8499 },
    { label: '20,000 pcs', quantity: 20000, price: 14999 },
    { label: '50,000 pcs', quantity: 50000, price: 31999 },
    { label: '1,00,000 pcs', quantity: 100000, price: 59999 },
  ],
  'extra-large-medicine-pouch-copy': [
    { label: '5,000 pcs', quantity: 5000, price: 9999 },
    { label: '10,000 pcs', quantity: 10000, price: 17999 },
    { label: '20,000 pcs', quantity: 20000, price: 31999 },
    { label: '50,000 pcs', quantity: 50000, price: 71999 },
    { label: '1,00,000 pcs', quantity: 100000, price: 149999 },
  ],
  'custom-printed-letterpad-multicolor-printing-a4-size-best-for-doctors-businesses': [
    { label: '10 pcs / 80 GSM', quantity: 10, price: 2300, attributes: { gsm: '80 GSM' } },
    { label: '10 pcs / 100 GSM', quantity: 10, price: 2800, attributes: { gsm: '100 GSM' } },
    { label: '10 pcs / 80 BOND', quantity: 10, price: 3400, attributes: { gsm: '80 BOND' } },
    { label: '10 pcs / 100 BOND', quantity: 10, price: 3900, attributes: { gsm: '100 BOND' } },
    { label: '20 pcs / 80 GSM', quantity: 20, price: 3800, attributes: { gsm: '80 GSM' } },
    { label: '20 pcs / 100 GSM', quantity: 20, price: 4500, attributes: { gsm: '100 GSM' } },
    { label: '20 pcs / 80 BOND', quantity: 20, price: 5700, attributes: { gsm: '80 BOND' } },
    { label: '20 pcs / 100 BOND', quantity: 20, price: 6400, attributes: { gsm: '100 BOND' } },
    { label: '50 pcs / 80 GSM', quantity: 50, price: 8000, attributes: { gsm: '80 GSM' } },
    { label: '50 pcs / 100 GSM', quantity: 50, price: 9000, attributes: { gsm: '100 GSM' } },
    { label: '50 pcs / 80 BOND', quantity: 50, price: 11000, attributes: { gsm: '80 BOND' } },
    { label: '50 pcs / 100 BOND', quantity: 50, price: 12500, attributes: { gsm: '100 BOND' } },
    { label: '100 pcs / 80 GSM', quantity: 100, price: 13500, attributes: { gsm: '80 GSM' } },
    { label: '100 pcs / 100 GSM', quantity: 100, price: 15500, attributes: { gsm: '100 GSM' } },
    { label: '100 pcs / 80 BOND', quantity: 100, price: 16500, attributes: { gsm: '80 BOND' } },
    { label: '100 pcs / 100 BOND', quantity: 100, price: 19500, attributes: { gsm: '100 BOND' } },
  ],
};

const raw = JSON.parse((await readFile(rawPath, 'utf8')).replace(/^\uFEFF/, ''));
const products = raw.map((item) => {
  const category = decodeHtml(item.categories?.[0]?.name ?? 'Uncategorized');
  const attributes = (item.attributes ?? []).map((attr) => ({
    name: decodeHtml(attr.name),
    terms: (attr.terms ?? []).map((term) => ({ name: decodeHtml(term.name), slug: decodeHtml(term.slug) })),
  }));
  const moq = inferMoq(item, attributes, category);
  const verified = verifiedRateTables[item.slug] ?? null;
  const simplePrice = rupees(item.prices?.price ?? 0);
  const rates = verified
    ? verified.map((rate) => ({
        source: 'verified-public-page',
        ...rate,
        unitPrice: Number((rate.price / rate.quantity).toFixed(4)),
        attributes: rate.attributes ?? {},
      }))
    : simplePrice > 0
      ? [{
          source: 'woocommerce-store-api',
          label: `${moq} qty`,
          quantity: moq,
          price: simplePrice,
          unitPrice: Number((simplePrice / moq).toFixed(4)),
          attributes: {},
        }]
      : [];

  return {
    rareprintId: item.id,
    slug: item.slug,
    name: decodeHtml(item.name),
    type: item.type,
    permalink: item.permalink,
    category,
    categorySlug: item.categories?.[0]?.slug ?? 'uncategorized',
    shortDescription: stripTags(item.short_description),
    image: item.images?.[0]?.src ?? null,
    thumbnail: item.images?.[0]?.thumbnail ?? item.images?.[0]?.src ?? null,
    moq,
    startingPrice: rates.length ? Math.min(...rates.map((rate) => rate.price)) : simplePrice,
    rates,
    attributes,
    hasVariableRatesToConfirm: item.type === 'variable' && !verified,
    stockStatus: item.stock_availability?.text || 'In stock',
    payment: {
      advancePercent: 50,
      advanceGateway: 'RAZORPAY',
      balanceMode: 'COD',
    },
    shipping: {
      provider: 'SHIPROCKET',
      chargesExtra: /shipping charges extra/i.test(stripTags(item.short_description)),
    },
  };
});

await writeFile(outPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'RarePrint WooCommerce Store API, with verified public slab tables where available',
  count: products.length,
  products,
}, null, 2)}\n`, 'utf8');

console.log(`Wrote ${products.length} products`);
