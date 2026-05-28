"use client";

import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919XXXXXXXXX";
  const href = `https://wa.me/${number}?text=Hi%20RarePrint%2C%20I%20want%20to%20place%20a%20print%20order`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-green-600 text-white shadow-lg md:bottom-6 md:right-6"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
