"use client";

import Image from "next/image";
import {
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CreditCard,
  Database,
  FileUp,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

type Product = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  moq: number;
  sizes: string[];
  finishes: string[];
  rates: { qty: number; price: number }[];
  seo: string;
};

const products: Product[] = [
  {
    slug: "medicine-paper-pouch",
    name: "Medicine Paper Pouch",
    category: "Medical Print",
    summary: "Pharmacy and clinic pouches with custom branding, dosage notes, and reorder details.",
    moq: 1000,
    sizes: ["3.5 x 5 in", "4.25 x 5.5 in", "5 x 7 in"],
    finishes: ["Single color", "Multi color", "Center pasting", "QR ready"],
    rates: [{ qty: 1000, price: 1.65 }, { qty: 5000, price: 1.18 }, { qty: 10000, price: 0.92 }],
    seo: "custom medicine pouch printing for pharmacies, doctors, clinics, hospitals, and labs",
  },
  {
    slug: "business-cards",
    name: "Premium Business Cards",
    category: "Stationery",
    summary: "Standard, textured, laminated, and luxury cards with front-back print options.",
    moq: 100,
    sizes: ["3.5 x 2 in", "Square", "Rounded edge"],
    finishes: ["Matte", "Gloss", "Velvet lamination", "Spot UV ready"],
    rates: [{ qty: 100, price: 2.8 }, { qty: 500, price: 1.45 }, { qty: 1000, price: 1.05 }],
    seo: "business card printing with premium paper, lamination, and custom design upload",
  },
  {
    slug: "stickers-labels",
    name: "Stickers And Labels",
    category: "Labels",
    summary: "Bottle labels, product stickers, sheet stickers, barcode labels, and packaging seals.",
    moq: 250,
    sizes: ["Custom die size", "A4 sheet", "Roll labels"],
    finishes: ["Gloss", "Matte", "Transparent", "Water-resistant"],
    rates: [{ qty: 250, price: 2.1 }, { qty: 1000, price: 0.95 }, { qty: 5000, price: 0.42 }],
    seo: "custom sticker printing, product label printing, barcode labels, roll labels",
  },
  {
    slug: "flyers-leaflets",
    name: "Flyers And Leaflets",
    category: "Marketing",
    summary: "A5, A4, menu, clinic leaflet, sales flyer, and campaign handout printing.",
    moq: 500,
    sizes: ["A5", "A4", "DL", "Custom"],
    finishes: ["Single side", "Double side", "Folded", "Bulk offset"],
    rates: [{ qty: 500, price: 1.9 }, { qty: 2000, price: 0.86 }, { qty: 10000, price: 0.38 }],
    seo: "flyer printing, leaflet printing, brochure printing, menu printing",
  },
  {
    slug: "letterheads-envelopes",
    name: "Letterheads And Envelopes",
    category: "Office Print",
    summary: "Company stationery kits with letterhead, envelope, invoice, and receipt book options.",
    moq: 500,
    sizes: ["A4 letterhead", "9 x 4 envelope", "10 x 12 envelope"],
    finishes: ["Offset", "Digital", "Window envelope", "Security tint"],
    rates: [{ qty: 500, price: 2.35 }, { qty: 2000, price: 1.18 }, { qty: 5000, price: 0.74 }],
    seo: "letterhead printing, envelope printing, corporate stationery printing",
  },
  {
    slug: "corporate-gifts",
    name: "Corporate Gifts",
    category: "Gifting",
    summary: "Brandable pens, mugs, diaries, calendars, desk gifts, and onboarding kits.",
    moq: 50,
    sizes: ["Product based", "Gift kit", "Bulk pack"],
    finishes: ["Laser mark", "UV print", "Screen print", "Embroidery ready"],
    rates: [{ qty: 50, price: 85 }, { qty: 250, price: 62 }, { qty: 1000, price: 48 }],
    seo: "corporate gifts printing, branded gifts, custom mugs, pens, diaries, calendars",
  },
];

const features = [
  { icon: Palette, title: "Designer Studio", text: "Upload artwork, use templates, request AI layout help, or connect Canva/Adobe-style APIs later." },
  { icon: Database, title: "Separate Rate Database", text: "Catalog and rate slabs are structured separately so pricing can move without code changes." },
  { icon: Boxes, title: "ERP Connected", text: "Public checkout sends orders into the ERP order pipeline with production, accounts, and dispatch visibility." },
  { icon: CreditCard, title: "Payments Ready", text: "Razorpay/Cashfree/UPI hooks can collect 50% advance, verify payments, and update ERP accounts." },
  { icon: Truck, title: "Shipping Tracking", text: "Shiprocket today, Bigship tomorrow: the connector layer can swap courier APIs without touching checkout." },
  { icon: Bot, title: "AI And MCP Ready", text: "Future agents can quote jobs, check stock, create designs, answer customers, and update CRM tasks." },
];

const futureStack = [
  "AI quote assistant for size, GSM, side, quantity, and delivery suggestions",
  "MCP tools for ERP order lookup, customer history, paper stock, and production ETA",
  "Design proof approval with WhatsApp/SMS/email reminders",
  "Customer portal with repeat order, wallet, invoice, and tracking timeline",
  "SEO product pages for every product, city, and industry",
  "Admin rate editor with import/export and effective dates",
];

function bestRate(product: Product, qty: number) {
  return [...product.rates].reverse().find((rate) => qty >= rate.qty) ?? product.rates[0];
}

export function StorefrontClient() {
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState(products[0].slug);
  const [qty, setQty] = useState(products[0].moq);
  const [customer, setCustomer] = useState({ name: "", phone: "", city: "" });
  const [status, setStatus] = useState<string | null>(null);

  const filtered = products.filter((product) =>
    `${product.name} ${product.category} ${product.seo}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = products.find((product) => product.slug === selectedSlug) ?? products[0];
  const rate = bestRate(selected, qty);
  const subtotal = Math.max(qty, selected.moq) * rate.price;
  const advance = Math.ceil(subtotal * 0.5);

  const jsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "Store",
    name: "RarePrint Online Printing",
    url: "https://rareprint.in/web-to-print",
    description: "ERP-connected online printing storefront for custom print products.",
    makesOffer: products.map((product) => ({ "@type": "Offer", itemOffered: { "@type": "Product", name: product.name } })),
  }), []);

  async function submitLead() {
    setStatus("Sending order to ERP...");
    try {
      const response = await fetch(`${API_BASE_URL}/storefront/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          item: {
            productSlug: selected.slug,
            productName: selected.name,
            quantity: Math.max(qty, selected.moq),
            unitPrice: rate.price,
            artworkNotes: "Web-to-print storefront order. Customer can upload artwork or use designer studio.",
          },
          quote: { subtotal, advance },
        }),
      });
      if (!response.ok) throw new Error("Could not submit");
      const data = await response.json();
      setStatus(`ERP order received: ${data.orderNumber ?? data.orderId}`);
    } catch {
      setStatus("Order details saved on screen. Backend connection needs deployment/API setup.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7faf9] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <a href="#top" className="flex items-center gap-3 text-slate-950">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">RP</span>
            <span>
              <strong className="block text-sm">RarePrint</strong>
              <small className="block text-xs text-slate-500">Online Printing</small>
            </span>
          </a>
          <div className="hidden items-center gap-6 text-sm font-bold text-slate-600 md:flex">
            <a href="#products">Products</a>
            <a href="#studio">Studio</a>
            <a href="#rates">Rates</a>
            <a href="#checkout">Checkout</a>
          </div>
          <a href="#checkout" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950">
            Start Order <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </nav>

      <section id="top" className="relative overflow-hidden bg-white">
        <div className="mx-auto grid min-h-[620px] max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative z-10">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-800">
              <Sparkles className="h-4 w-4" /> ERP connected web-to-print
            </p>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-normal text-slate-950 md:text-7xl">
              RarePrint Online Printing
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-600">
              A futuristic storefront for custom print ordering: live rates, artwork upload, designer studio, payment, shipment tracking, and direct ERP order creation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#products" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-black text-white">
                Browse Products <ChevronRight className="h-4 w-4" />
              </a>
              <a href="#studio" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-950">
                Design Studio <Wand2 className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["50% advance ready", "Bigship connector planned", "SEO product pages"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Check className="h-4 w-4 text-emerald-600" /> {item}
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <Image
              src="/web-to-print-hero.png"
              alt="Modern web-to-print product mockups with a design editor"
              width={1400}
              height={1000}
              priority
              className="aspect-[1.25/1] w-full rounded-lg object-cover shadow-2xl shadow-slate-300"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 py-4 text-white">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 text-sm font-bold sm:grid-cols-2 lg:grid-cols-4">
          {["Public catalog from database", "Live slab rate engine", "Payment and shipping APIs", "ERP order pipeline"].map((item) => (
            <span key={item} className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> {item}</span>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto max-w-7xl px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-normal">Product Catalog</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Starter catalog based on public RarePrint-style print categories and common web-to-print products. Rates are sample slabs for database setup and should be confirmed before launch.
            </p>
          </div>
          <label className="relative block w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-500" />
          </label>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <button
              key={product.slug}
              onClick={() => { setSelectedSlug(product.slug); setQty(product.moq); }}
              className={`rounded-lg border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${selected.slug === product.slug ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"}`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{product.category}</span>
                <span className="text-xs font-black text-emerald-700">MOQ {product.moq.toLocaleString()}</span>
              </div>
              <h3 className="text-xl font-black tracking-normal">{product.name}</h3>
              <p className="mt-2 min-h-12 text-sm font-semibold leading-6 text-slate-600">{product.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.finishes.slice(0, 3).map((finish) => <span key={finish} className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{finish}</span>)}
              </div>
              <p className="mt-5 text-sm font-black">From ₹{product.rates.at(-1)?.price.toFixed(2)} / piece</p>
            </button>
          ))}
        </div>
      </section>

      <section id="studio" className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-black tracking-normal">Advanced Web-To-Print Features</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-[#fbfcfd] p-5">
                <Icon className="h-6 w-6 text-emerald-600" />
                <h3 className="mt-4 text-lg font-black tracking-normal">{title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="rates" className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Live Rate Preview</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            This calculator reads from product/rate slabs. In production, these rows should come from the ERP database and be editable by admin.
          </p>
          <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">Product</span>
              <select value={selected.slug} onChange={(e) => { const next = products.find((item) => item.slug === e.target.value) ?? products[0]; setSelectedSlug(next.slug); setQty(next.moq); }} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none">
                {products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">Quantity</span>
              <input type="number" min={selected.moq} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none" />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Unit Rate" value={`₹${rate.price.toFixed(2)}`} />
              <Metric label="Subtotal" value={`₹${Math.ceil(subtotal).toLocaleString()}`} />
              <Metric label="Advance" value={`₹${advance.toLocaleString()}`} />
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr><th className="px-4 py-3">Qty From</th><th className="px-4 py-3">Rate / Piece</th><th className="px-4 py-3">Use Case</th></tr>
            </thead>
            <tbody>
              {selected.rates.map((row) => (
                <tr key={row.qty} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-black">{row.qty.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold">₹{row.price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600">Bulk {selected.category.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="checkout" className="bg-slate-950 py-14 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <h2 className="text-3xl font-black tracking-normal">Checkout Into ERP</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
              Trial flow: capture customer, product, quantity, quote, and artwork instruction, then create an ERP order for approval and production.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Customer / business name" className="h-11 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-bold outline-none placeholder:text-slate-400" />
              <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Phone" className="h-11 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-bold outline-none placeholder:text-slate-400" />
              <input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} placeholder="City" className="h-11 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-bold outline-none placeholder:text-slate-400 sm:col-span-2" />
            </div>
            <button onClick={submitLead} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">
              Send Trial Order To ERP <FileUp className="h-4 w-4" />
            </button>
            {status && <p className="mt-4 rounded-lg bg-white/10 px-4 py-3 text-sm font-bold text-emerald-100">{status}</p>}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/10 p-5">
            <h3 className="text-xl font-black tracking-normal">Futuristic Add-Ons</h3>
            <div className="mt-4 space-y-3">
              {futureStack.map((item) => (
                <p key={item} className="flex gap-3 text-sm font-semibold leading-6 text-slate-200">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
