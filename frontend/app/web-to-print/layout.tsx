import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { TrustBar } from "./components/TrustBar";
import { NativeAppRedirect } from "./components/NativeAppRedirect";
import { getAllCategories } from "./catalog";

export default function WebToPrintLayout({ children }: { children: React.ReactNode }) {
  const categories = getAllCategories().slice(0, 12).map((category) => ({ slug: category.slug, name: category.name }));
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <NativeAppRedirect />
      <TrustBar />
      <Header categories={categories} />
      {children}
      <Footer />
    </div>
  );
}
