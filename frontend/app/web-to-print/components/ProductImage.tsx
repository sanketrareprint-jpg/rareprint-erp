"use client";

import Image from "next/image";
import { useState } from "react";
import { ProductVisual } from "./ProductVisual";

export function ProductImage({
  src,
  alt,
  label,
  sizes,
  className = "object-contain p-3",
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  label: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(!src);

  if (!src || failed) {
    return <ProductVisual label={label} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      loading={priority ? "eager" : "lazy"}
      priority={priority}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
