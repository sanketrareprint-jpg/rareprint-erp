import type { Metadata } from "next";
import Link from "next/link";
import { Palette, Wand2 } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { ArtworkUploadCard } from "./ArtworkUploadCard";
import { DesignerHelpForm } from "./DesignerHelpForm";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Choose Design Option | RarePrint",
  description: "Upload artwork, design in RarePrint Studio, use Canva, or ask RarePrint designer for help.",
};

export default function DesignPage() {
  return (
    <main className="bg-white text-slate-950">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb items={[{ label: "Home", href: "/web-to-print" }, { label: "Products", href: "/web-to-print/categories" }, { label: "Choose Design Option" }]} />
        <h1 className="text-3xl font-black tracking-normal text-[#CC0000] md:text-4xl">Choose Design Option</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Pick the fastest way to create or submit your artwork. Our team reviews print readiness before production starts.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ArtworkUploadCard />
          <LargeCard
            icon={Wand2}
            title="Design in RarePrint Studio"
            body="Use our online editor with print templates, your brand colours, and text tools. No design skills needed. Save and order directly."
            cta="Open Design Studio →"
            href="/design-studio"
          />
          <LargeCard
            icon={Palette}
            title="Design in Canva (Free)"
            body="Open Canva with your product's exact print dimensions pre-set. Design, download as PDF, and upload it here. Works with your existing Canva account."
            cta="Open Canva →"
            href="https://www.canva.com/design?utm_source=rareprint"
            note="After designing: download as PDF Print → then Upload above."
            external
          />
          <DesignerHelpForm />
        </div>
      </section>
    </main>
  );
}

function LargeCard({ icon: Icon, title, body, cta, href, chips = [], note, external = false }: { icon: any; title: string; body: string; cta: string; href: string; chips?: string[]; note?: string; external?: boolean }) {
  return (
    <div className="rounded-lg border border-red-100 bg-white p-5 shadow-sm">
      <Icon className="h-7 w-7 text-[#CC0000]" />
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => <span key={chip} className="rounded-full bg-red-50 px-3 py-2 text-sm font-black text-[#CC0000]">{chip}</span>)}
        </div>
      )}
      <Link href={href} target={external ? "_blank" : undefined} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#CC0000] px-4 py-3 text-sm font-black text-white">
        {cta}
      </Link>
      {note && <p className="mt-3 text-sm font-bold text-slate-500">{note}</p>}
    </div>
  );
}
