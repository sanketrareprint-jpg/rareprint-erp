import { FileText, Gift, Package, Sticker, WalletCards } from "lucide-react";

function visualConfig(label: string) {
  const text = label.toLowerCase();
  if (/sticker|label/.test(text)) return { Icon: Sticker, bg: "bg-red-50", text: "STK", color: "text-red-700" };
  if (/bill|book|ncr|invoice/.test(text)) return { Icon: FileText, bg: "bg-slate-100", text: "BILL", color: "text-slate-700" };
  if (/card|visiting/.test(text)) return { Icon: WalletCards, bg: "bg-red-50", text: "CARD", color: "text-red-700" };
  if (/gift|pen|key|corporate/.test(text)) return { Icon: Gift, bg: "bg-slate-100", text: "GIFT", color: "text-slate-700" };
  return { Icon: Package, bg: "bg-slate-100", text: "PRINT", color: "text-slate-700" };
}

export function ProductVisual({ label, compact = false }: { label: string; compact?: boolean }) {
  const { Icon, bg, text, color } = visualConfig(label);

  return (
    <div className={`flex h-full w-full items-center justify-center ${bg}`}>
      <div className="relative grid h-full w-full place-items-center overflow-hidden">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/70" />
        <div className="absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-[#CC0000]/10" />
        <div className="relative flex flex-col items-center gap-2">
          <div className={`grid ${compact ? "h-12 w-12" : "h-16 w-16"} place-items-center rounded-2xl bg-white shadow-sm`}>
            <Icon className={`${compact ? "h-6 w-6" : "h-8 w-8"} ${color}`} />
          </div>
          <span className={`${compact ? "text-[10px]" : "text-xs"} font-black tracking-widest ${color}`}>{text}</span>
        </div>
      </div>
    </div>
  );
}
