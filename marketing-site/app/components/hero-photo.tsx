// Real photography instead of a div-built fake product screenshot. No
// image-generation tool is available in this environment, and there's no
// clean, de-identified screenshot of the real product to publish yet (a
// real one would show real RarePrint business data) — so these are
// labeled placeholder photographs. Swap the picsum.photos URLs for actual
// print-shop photography before this page goes live.

const PHOTOS = {
  press: {
    seed: "rareprint-press-floor-working",
    alt: "Print shop production floor",
  },
  team: {
    seed: "rareprint-team-reviewing-order",
    alt: "Print shop team reviewing an order together",
  },
} as const;

export function HeroPhoto({
  variant = "press",
  caption,
}: {
  variant?: keyof typeof PHOTOS;
  caption?: string;
}) {
  const photo = PHOTOS[variant];
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-xl">
      {/* TODO: replace with a real photo of a RarePrint production floor */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://picsum.photos/seed/${photo.seed}/960/720`}
        alt={photo.alt}
        className="aspect-[4/3] w-full object-cover"
      />
      {caption ? (
        <figcaption className="border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
