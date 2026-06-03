import { Breadcrumb } from "../components/Breadcrumb";
import { TrackOrderClient } from "./TrackOrderClient";

export const revalidate = 3600;

export const metadata = {
  title: "Track Your Print Order | RarePrint",
  description:
    "Track your RarePrint web-to-print order status, shipping updates, and dispatch details.",
};

export default function TrackOrderPage() {
  return (
    <main className="bg-white">
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: "Home", href: "/web-to-print" },
            { label: "Track Order" },
          ]}
        />

        <TrackOrderClient />

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Order Received", "Artwork and payment confirmed."],
            ["Printing", "Your product is in production."],
            ["Shipped", "Tracking link shared after dispatch."],
          ].map(([title, copy]) => (
            <div
              className="rounded-xl border border-slate-200 bg-white p-4"
              key={title}
            >
              <h2 className="text-base font-black text-slate-950">{title}</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                {copy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
