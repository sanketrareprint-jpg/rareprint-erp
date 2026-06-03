import Link from "next/link";

export const revalidate = 3600;

export const metadata = {
  title: "Order Confirmed | RarePrint",
  description: "Your RarePrint web-to-print order has been created successfully.",
};

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="bg-white">
      <section className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-2xl font-black text-slate-900">
          RP
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">Payment Received</p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900 sm:text-5xl">Order Confirmed</h1>
        <p className="mt-4 text-base font-semibold leading-7 text-slate-600">
          Your RarePrint order has been created in ERP and the 50% advance has been marked for verification.
        </p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
          ERP Order ID: {id}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link href="/web-to-print/track-order" className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800">
            Track Order
          </Link>
          <Link href="/web-to-print/categories" className="min-h-12 rounded-xl bg-[#CC0000] px-5 py-3 text-sm font-extrabold text-white">
            Continue Shopping
          </Link>
        </div>
      </section>
    </main>
  );
}
