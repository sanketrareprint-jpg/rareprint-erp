import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { TrustBar } from "./components/TrustBar";
import { NativeAppRedirect } from "./components/NativeAppRedirect";
import { getAllCategories } from "./catalog";

export default function WebToPrintLayout({ children }: { children: React.ReactNode }) {
  const categories = getAllCategories().slice(0, 12).map((category) => ({ slug: category.slug, name: category.name }));
  return (
    <div className="min-h-screen bg-white text-slate-950">
      {/* Runs as the HTML is parsed, before any storefront content below is
          drawn: inside the RarePrint Android app (Capacitor registers
          window.androidBridge before page scripts; browsers and other apps'
          in-app browsers don't have it) hide the page and go to the ERP.
          NativeAppRedirect is the fallback for client-side navigation. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "if(window.androidBridge){document.documentElement.style.visibility='hidden';location.replace('/dashboard');}",
        }}
      />
      <NativeAppRedirect />
      <TrustBar />
      <Header categories={categories} />
      {children}
      <Footer />
    </div>
  );
}
