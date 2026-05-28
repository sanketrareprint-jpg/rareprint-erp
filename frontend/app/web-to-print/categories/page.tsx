import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, FileText, Gift, IdCard, Package, ReceiptText, Sticker, Stethoscope } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { formatMoney, getAllCategories } from "../catalog";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "All Print Product Categories | RarePrint",
  description: "Browse all custom print products — visiting cards, stickers, bill books, carry bags, healthcare printing, and corporate gifts. Order online with 50% advance.",
};

const iconMap: Record<string, any> = {
  "visiting-cards": IdCard,
  "prescription-stickers": Sticker,
  "bill-book": ReceiptText,
  "letterhead": FileText,
  "letterpad": BookOpen,
  envelope: FileText,
  pamphlet: FileText,
  "carry-bag": Package,
  "doctor-files": Stethoscope,
  "xray-bag": Stethoscope,
  calendar: CalendarDays,
  "corporate-gifts": Gift,
};

export default function CategoriesPage() {
  const categories = getAllCategories();
  return (
    <main className="bg-white text-slate-950">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb items={[{ label: "Home", href: "/web-to-print" }, { label: "All Categories" }]} />
        <h1 className="text-3xl font-black tracking-normal text-[#CC0000] md:text-4xl">All Print Categories</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Choose a category to see products, rates, and ordering options.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          {categories.map((category) => {
            const Icon = iconMap[category.slug] ?? BriefcaseBusiness;
            return (
              <Link key={category.slug} href={`/web-to-print/category/${category.slug}`} className="rounded-lg border border-red-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <Icon className="h-6 w-6 text-[#CC0000]" />
                <h2 className="mt-3 text-base font-black">{category.name}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{category.count} products</p>
                <p className="mt-3 inline-flex items-center gap-1 text-sm font-black text-[#CC0000]">
                  {category.slug === "corporate-gifts" ? "Get Quote" : `From ${formatMoney(category.startingPrice)}`} <ArrowRight className="h-4 w-4" />
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
