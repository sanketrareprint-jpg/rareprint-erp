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

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function firstNumber(value = '') {
  const match = String(value).replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function inferMoq(product, variations) {
  const quantities = [
    ...product.attributes.flatMap((attr) =>
      /qty|quantity|nos|pcs/i.test(attr.name)
        ? attr.terms.map((term) => firstNumber(term.name)).filter(Boolean)
        : [],
    ),
    ...variations.map((variation) => firstNumber(Object.values(variation.attributes ?? {}).join(' '))).filter(Boolean),
    firstNumber(product.shortDescription.match(/MOQ:?\s*([\d,]+)/i)?.[1] ?? ''),
  ].filter((n) => Number.isFinite(n) && n > 0);
  return quantities.length ? Math.min(...quantities) : product.category === 'Pen' ? 1000 : 1;
}

function extractVariationJson(html) {
  const match = html.match(/data-product_variations="([^"]*)"/);
  if (!match) return [];
  try {
    return JSON.parse(decodeHtml(match[1]));
  } catch {
    return [];
  }
}

function variationLabel(variation) {
  const attrs = Object.values(variation.attributes ?? {})
    .map((value) => decodeHtml(String(value)).replace(/^pa_/, '').trim())
    .filter(Boolean);
  return attrs.join(' / ') || `Variation ${variation.variation_id ?? ''}`.trim();
}

function toRateSlabs(product, variations) {
  if (variations.length) {
    return variations
      .map((variation) => {
        const label = variationLabel(variation);
        const quantity = firstNumber(label) ?? firstNumber(variation.min_qty) ?? product.moq ?? 1;
        const price = money(variation.display_price ?? variation.display_regular_price ?? 0);
        return {
          source: 'woocommerce-variation',
          label,
          quantity,
          price,
          unitPrice: quantity ? Number((price / quantity).toFixed(4)) : price,
          attributes: Object.fromEntries(
            Object.entries(variation.attributes ?? {}).map(([key, value]) => [key.replace(/^attribute_/, ''), decodeHtml(value)]),
          ),
        };
      })
      .filter((rate) => rate.price > 0)
      .sort((a, b) => a.quantity - b.quantity || a.price - b.price);
  }

  const price = money(product.rawPrice);
  if (price <= 0) return [];
  const quantity = product.moq || 1;
  return [{
    source: 'woocommerce-simple',
    label: `${quantity} qty`,
    quantity,
    price,
    unitPrice: Number((price / quantity).toFixed(4)),
    attributes: {},
  }];
}

async function fetchText(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    headers: {
      'user-agent': 'RarePrint ERP catalog importer',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!response.ok) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      return fetchText(url, attempt + 1);
    }
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

const raw = JSON.parse((await readFile(rawPath, 'utf8')).replace(/^\uFEFF/, ''));
const variationMap = new Map();
const variableProducts = raw.filter((item) => item.type === 'variable' && item.permalink);
let cursor = 0;

async function worker() {
  while (cursor < variableProducts.length) {
    const item = variableProducts[cursor];
    cursor += 1;
    try {
      const html = await fetchText(item.permalink);
      variationMap.set(item.id, extractVariationJson(html));
    } catch (error) {
      variationMap.set(item.id, { error: error.message, variations: [] });
    }
    if (cursor % 25 === 0) console.log(`Fetched variations for ${cursor}/${variableProducts.length}`);
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));

for (let index = 0; index < raw.length; index += 1) {
  const item = raw[index];
  const attributes = (item.attributes ?? []).map((attr) => ({
    name: decodeHtml(attr.name),
    terms: (attr.terms ?? []).map((term) => ({ name: decodeHtml(term.name), slug: decodeHtml(term.slug) })),
  }));
  const base = {
    rareprintId: item.id,
    slug: item.slug,
    name: decodeHtml(item.name),
    type: item.type,
    permalink: item.permalink,
    category: decodeHtml(item.categories?.[0]?.name ?? 'Uncategorized'),
    categorySlug: item.categories?.[0]?.slug ?? 'uncategorized',
    shortDescription: stripTags(item.short_description),
    image: item.images?.[0]?.src ?? null,
    thumbnail: item.images?.[0]?.thumbnail ?? item.images?.[0]?.src ?? null,
    rawPrice: item.prices?.price ?? '0',
    attributes,
    stockStatus: item.stock_availability?.text || 'In stock',
  };

  let variations = [];
  const variationResult = variationMap.get(item.id);
  if (Array.isArray(variationResult)) {
    variations = variationResult;
  } else if (variationResult?.error) {
    base.importWarning = `Variation fetch failed: ${variationResult.error}`;
  }

  const withMoq = { ...base, moq: 1 };
  withMoq.moq = inferMoq(withMoq, variations);
  const rates = toRateSlabs(withMoq, variations);

  normalized.push({
    ...withMoq,
    startingPrice: rates.length ? Math.min(...rates.map((rate) => rate.price)) : money(item.prices?.price ?? 0),
    rates,
    payment: {
      advancePercent: 50,
      balanceMode: 'COD',
      gateway: 'RAZORPAY_ADVANCE',
    },
    shipping: {
      provider: 'SHIPROCKET',
      chargesExtra: /shipping charges extra/i.test(withMoq.shortDescription),
    },
  });

  if ((index + 1) % 100 === 0) console.log(`Normalized ${index + 1}/${raw.length}`);
}

await writeFile(outPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'https://rareprint.in/wp-json/wc/store/products + product page variation data',
  products: normalized,
}, null, 2)}\n`, 'utf8');

console.log(`Wrote ${normalized.length} products to ${outPath.pathname}`);
