import catalog from "./rareprint-catalog.json";

export type Rate = {
  qty: number;
  price: number;
  unitPrice: number;
  label: string;
};

export type Product = {
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  summary: string;
  moq: number;
  sizes: string[];
  finishes: string[];
  rates: Rate[];
  image: string | null;
  hasVariableRatesToConfirm: boolean;
  attributes: Array<{ name: string; terms: Array<{ name: string; slug?: string }> }>;
  payment: { advancePercent: number; advanceGateway: string; balanceMode: string };
  shipping: { provider: string; chargesExtra: boolean };
};

export type Category = {
  slug: string;
  name: string;
  count: number;
  startingPrice: number | null;
};

const hiddenCategorySlugs = new Set(["uncategorized", "sample-product-set"]);
const giftSlugs = new Set([
  "keychain",
  "pen",
  "pen-stand",
  "mobile-stand",
  "key-holder",
  "clip-board",
  "paper-clip",
  "coaster",
  "bottles",
  "money-box",
  "photo-frame",
  "novelties",
  "paper-weight",
]);

const categoryOrder = [
  "visiting-cards",
  "prescription-stickers",
  "bill-book",
  "letterhead",
  "letterpad",
  "envelope",
  "pamphlet",
  "carry-bag",
  "doctor-files",
  "xray-bag",
  "calendar",
  "corporate-gifts",
];

function cleanText(value = "") {
  return String(value)
    .replace(/@media[^{]*\{[^}]*\{[^}]*\}[^}]*\}/g, "")
    .replace(/\.[a-z-]+\s*\{[^}]*\}/g, "")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;])/g, "$1")
    .trim();
}

function parseProductSummary(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/@media[^{]*\{[^}]*\{[^}]*\}[^}]*\}/g, "")
    .replace(/\.[a-z-]+\s*\{[^}]*\}/g, "")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/^.*(?:\d+,\d+\s*pcs|\d+\/\-|QTY\s+\d+\s+GSM).*$/gmi, "")
    .replace(/^\s*[\d,.\-\/]+\s*$/gm, "")
    .replace(/^\s*(?:\d{2,3}\s+GSM(?:\s+BOND)?)\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 2)
    .join("\n")
    .trim();
}

export function parseSpecLines(raw: string): { label: string; value: string }[] {
  if (!raw) return [];
  const lines = raw
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/&#\d+;/g, "")
    .replace(/@media[\s\S]*?\}\s*\}/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(":") && line.length > 4 && line.length < 120);

  return lines
    .map((line) => {
      const colonIdx = line.indexOf(":");
      const label = line.slice(0, colonIdx).trim().replace(/^[^a-z0-9]/i, "").trim();
      const value = line.slice(colonIdx + 1).trim();
      return { label, value };
    })
    .filter(({ label, value }) =>
      label.length > 0 &&
      value.length > 0 &&
      !label.match(/^\d/) &&
      !value.match(/^\s*\d+\/\-/),
    )
    .slice(0, 8);
}

function groupedSlug(slug = "") {
  return giftSlugs.has(slug) ? "corporate-gifts" : slug;
}

function groupedName(slug: string, fallback: string) {
  return groupedSlug(slug) === "corporate-gifts" ? "Corporate Gifts" : fallback;
}

function firstNumber(value = "") {
  const match = value.replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function ratesFrom(product: any): Rate[] {
  const rates = Array.isArray(product.rates) ? product.rates : [];
  const mapped: Rate[] = rates
    .map((rate: any) => {
      const qty = Number(rate.quantity ?? rate.qty ?? product.moq ?? 1);
      const price = Number(rate.price ?? 0);
      return {
        qty,
        price,
        unitPrice: Number(rate.unitPrice ?? (price / Math.max(1, qty))),
        label: String(rate.label ?? `${qty.toLocaleString("en-IN")} qty`),
      };
    });
  return mapped
    .filter((rate) => rate.price > 0 && rate.qty > 0)
    .sort((a, b) => a.qty - b.qty || a.price - b.price);
}

export function parseDescriptionRates(product: any): Rate[] {
  const raw: string = product.shortDescription || "";
  const quantities = (product.attributes ?? [])
    .find((attr: any) => /quantity/i.test(attr.name))
    ?.terms.map((term: any) => {
      const qty = parseInt(String(term.name).replace(/[^0-9]/g, ""), 10);
      return Number.isNaN(qty) ? null : qty;
    })
    .filter(Boolean) as number[] | undefined;

  if (!quantities?.length) return [];

  const priceMatches = Array.from(raw.matchAll(/(\d{1,3}(?:,\d{3})*)\s*\/?\-/g))
    .map((match) => parseInt(match[1].replace(/,/g, ""), 10))
    .filter((price) => price > 100 && price < 10000000);

  if (priceMatches.length < quantities.length) return [];

  return quantities
    .map((qty, index) => ({
      qty,
      price: priceMatches[index] ?? 0,
      unitPrice: priceMatches[index] ? parseFloat((priceMatches[index] / qty).toFixed(2)) : 0,
      label: `${qty.toLocaleString("en-IN")} pcs`,
    }))
    .filter((rate) => rate.price > 0);
}

function termsFor(product: any, matcher: RegExp) {
  return (product.attributes ?? [])
    .filter((attr: any) => matcher.test(String(attr.name)))
    .flatMap((attr: any) => (attr.terms ?? []).map((term: any) => cleanText(term.name)))
    .filter(Boolean);
}

function sizesFor(product: any) {
  const attrSizes = termsFor(product, /size|bag size|dimension/i);
  const titleSizes = Array.from(cleanText(product.name).matchAll(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:inch|in|cm)?\b/gi)).map((m) => m[0]);
  return Array.from(new Set([...attrSizes, ...titleSizes])).slice(0, 6);
}

function finishesFor(product: any) {
  return termsFor(product, /lamination|quality|gsm|thickness|printing|side|material|finish/i).slice(0, 8);
}

const products: Product[] = (catalog.products as any[])
  .filter((product) => !/out of stock/i.test(product.stockStatus ?? ""))
  .map((product) => {
    const originalSlug = String(product.categorySlug ?? "uncategorized");
    const categorySlug = groupedSlug(originalSlug);
    const rates = (() => {
      const fromApi = ratesFrom(product);
      if (fromApi.length >= 2) return fromApi;
      const fromDesc = parseDescriptionRates(product);
      return fromDesc.length >= fromApi.length ? fromDesc : fromApi;
    })();
    const moq = Math.max(1, Number(product.moq ?? firstNumber(cleanText(product.shortDescription)) ?? rates[0]?.qty ?? 1));
    return {
      slug: String(product.slug),
      name: cleanText(product.name),
      category: groupedName(originalSlug, cleanText(product.category || "Uncategorized")),
      categorySlug,
      summary: parseProductSummary(product.shortDescription || ""),
      moq,
      sizes: sizesFor(product),
      finishes: finishesFor(product),
      rates,
      image: product.image ?? product.thumbnail ?? null,
      hasVariableRatesToConfirm: Boolean(product.hasVariableRatesToConfirm) || categorySlug === "corporate-gifts",
      attributes: product.attributes ?? [],
      payment: product.payment ?? { advancePercent: 50, advanceGateway: "RAZORPAY", balanceMode: "COD" },
      shipping: product.shipping ?? { provider: "SHIPROCKET", chargesExtra: true },
    };
  })
  .filter((product) => !hiddenCategorySlugs.has(product.categorySlug));

export function getAllCategories(): Category[] {
  const map = new Map<string, Category>();
  for (const product of products) {
    const current = map.get(product.categorySlug) ?? {
      slug: product.categorySlug,
      name: product.category,
      count: 0,
      startingPrice: null,
    };
    const lowest = product.rates.length ? Math.min(...product.rates.map((rate) => rate.price)) : null;
    current.count += 1;
    current.startingPrice = lowest === null
      ? current.startingPrice
      : current.startingPrice === null
        ? lowest
        : Math.min(current.startingPrice, lowest);
    map.set(product.categorySlug, current);
  }

  return Array.from(map.values()).sort((a, b) => {
    const ai = categoryOrder.indexOf(a.slug);
    const bi = categoryOrder.indexOf(b.slug);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return b.count - a.count;
  });
}

export function getProductsByCategory(categorySlug: string): Product[] {
  return products.filter((product) => product.categorySlug === categorySlug);
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function getFeaturedProducts(limit = 6): Product[] {
  return products
    .filter((product) => product.rates.length > 0 && !product.hasVariableRatesToConfirm)
    .slice(0, limit);
}

export function searchProducts(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter((product) =>
    [product.name, product.category, product.summary, product.sizes.join(" "), product.finishes.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

export function getAllProducts(): Product[] {
  return products;
}

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Get Quote";
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function getGsmFromName(name: string) {
  return cleanText(name).match(/\b\d{2,4}\s*(?:gsm|micron|guage)\b/i)?.[0] ?? null;
}
