import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us | RarePrint",
  description: "Contact RarePrint for custom printing orders. Phone: 9699349563. Address: Chandrapur, Maharashtra.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-12 text-white">
        <div className="mx-auto max-w-7xl px-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Get In Touch</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Contact Us</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">We&apos;re available Mon–Sat, 10:30 AM to 6:30 PM. Call, WhatsApp or email us.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-2">
          {/* Contact Details */}
          <div className="grid gap-5">
            <a href="tel:+919699349563" className="flex items-start gap-4 rounded-2xl border border-slate-200 p-5 hover:border-[#CC0000] transition-colors">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#CC0000] text-white"><Phone className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Phone</p>
                <p className="mt-1 font-black text-slate-900">+91 9699349563</p>
                <p className="text-sm font-bold text-slate-600">+91 9637318960</p>
                <p className="text-sm font-bold text-slate-600">+91 7020592482</p>
              </div>
            </a>

            <a href="mailto:sales@rareprint.in" className="flex items-start gap-4 rounded-2xl border border-slate-200 p-5 hover:border-[#CC0000] transition-colors">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#CC0000] text-white"><Mail className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Email</p>
                <p className="mt-1 font-black text-slate-900">sales@rareprint.in</p>
                <p className="text-sm font-bold text-slate-600">sales.rareprint@gmail.com</p>
              </div>
            </a>

            <a href="https://wa.me/918645614505?text=Hi%20RarePrint%2C%20I%20want%20to%20place%20a%20print%20order" target="_blank" rel="noreferrer"
              className="flex items-start gap-4 rounded-2xl border border-green-200 bg-green-50 p-5 hover:border-green-500 transition-colors">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-green-600 text-white"><MessageCircle className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">WhatsApp</p>
                <p className="mt-1 font-black text-slate-900">+91 8645614505</p>
                <p className="text-sm font-bold text-green-700">Click to chat now →</p>
              </div>
            </a>

            <div className="flex items-start gap-4 rounded-2xl border border-slate-200 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white"><MapPin className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Address</p>
                <p className="mt-1 font-black text-slate-900">RarePrint</p>
                <p className="text-sm font-bold leading-6 text-slate-600">
                  F-401, Tirupati Home Apartment-3,<br />
                  Near Medicine Complex, Behind Manwatkar Hospital,<br />
                  Ekori Ward, Chandrapur,<br />
                  Maharashtra – 442401
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-slate-200 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white"><Clock className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Business Hours</p>
                <p className="mt-1 font-black text-slate-900">Monday to Saturday</p>
                <p className="text-sm font-bold text-slate-600">10:30 AM – 6:30 PM</p>
                <p className="text-sm font-bold text-slate-400">Closed on Sundays & Public Holidays</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-xl font-black">Send Us a Message</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">We&apos;ll get back to you within a few hours.</p>
            <form action="mailto:sales@rareprint.in" method="get" encType="text/plain" className="mt-6 grid gap-4">
              <div>
                <label className="text-xs font-black uppercase text-slate-600">Your Name *</label>
                <input name="name" required placeholder="e.g. Dr. Rajesh Sharma"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#CC0000]" />
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-600">Phone Number *</label>
                <input name="phone" type="tel" required placeholder="e.g. 9699349563"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#CC0000]" />
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-600">What do you need printed?</label>
                <textarea name="body" rows={4} placeholder="e.g. 5000 prescription stickers with my clinic name and logo..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#CC0000] resize-none" />
              </div>
              <button type="submit" className="rounded-lg bg-[#CC0000] py-3 text-sm font-black text-white hover:bg-red-700">
                Send Message
              </button>
            </form>
            <p className="mt-3 text-xs font-semibold text-slate-400">
              Or WhatsApp us directly at{" "}
              <a href="https://wa.me/918645614505" target="_blank" rel="noreferrer" className="text-green-600 underline">+91 8645614505</a>
            </p>
          </div>
        </div>

        {/* Map embed */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200">
          <iframe
            title="RarePrint Location — Chandrapur, Maharashtra"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3748.0!2d79.2961!3d19.9615!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTnCsDU3JzQxLjQiTiA3OcKwMTcnNDYuMCJF!5e0!3m2!1sen!2sin!4v1"
            width="100%" height="320" style={{ border: 0 }} allowFullScreen loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
    </main>
  );
}
