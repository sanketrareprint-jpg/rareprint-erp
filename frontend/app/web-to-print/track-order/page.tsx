import { Breadcrumb } from "../components/Breadcrumb";

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

        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5 sm:p-8">
          <p className="text-sm font-black uppercase tracking-wide text-[#CC0000]">
            Order Tracking
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-5xl">
            Track Your Print Order
          </h1>
          <p className="mt-3 text-base font-medium leading-7 text-slate-700">
            Enter your order number or registered mobile number. Shipping details
            will be connected here once Shiprocket tracking is mapped to the
            storefront.
          </p>

          <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className="h-12 rounded-xl border border-red-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-[#CC0000]"
              placeholder="Order ID or mobile number"
              type="text"
            />
            <button
              className="h-12 rounded-xl bg-[#CC0000] px-6 text-base font-black text-white"
              type="button"
            >
              Check Status
            </button>
          </form>
        </div>

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
