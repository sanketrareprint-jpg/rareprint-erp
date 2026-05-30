"""
AI Sales Agent
══════════════
Powered by Anthropic Claude.
Handles the full sales conversation lifecycle:

  1. Greet customer
  2. Detect product interest → send fixed template (photo + rates + ToS)
  3. Answer follow-up questions
  4. Collect design requirements (size, qty, design file, deadline)
  5. Collect lead info (name, email, city)
  6. Persuade & close the sale
  7. Send payment link
  8. Confirm order and hand-off note

SYSTEM PROMPT is carefully crafted for a print shop sales agent.
"""

import os
import json
import logging
import re
import base64
import mimetypes
from anthropic import Anthropic

from conversation_store import ConversationStore
from aisensy_client import AiSensyClient
from products import PRODUCTS, GLOBAL_TOS, get_product_by_keyword, list_product_names

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY    = os.getenv("ANTHROPIC_API_KEY", "")
BUSINESS_NAME        = os.getenv("BUSINESS_NAME", "Rareprint")
BUSINESS_PHONE       = os.getenv("BUSINESS_PHONE", "+91 9699349563")
ALL_PRODUCTS_PDF_URL = os.getenv("ALL_PRODUCTS_PDF_URL", "").strip()
CUSTOM_SYSTEM_PROMPT = None   # Set by admin panel at runtime

ALL_PRODUCTS_TRIGGERS = [
    "all product", "all products", "catalog", "catalogue", "price list",
    "product list", "all rates", "full catalogue", "full catalog",
]

# ── System prompt ────────────────────────────────────────────────────────────
def build_system_prompt() -> str:
    from products import MOQ_LIST
    product_list = list_product_names()
    return f"""You are Riya, a sales person at Rareprint, a printing company in Chandrapur.

You talk on WhatsApp like a real human. Casual, respectful Hinglish or English based on the customer. Use sir/madam. Do not use bhai or bhaiyya.

Products: {product_list}

KEY FACTS:
- MOQ for pouches/stickers: 5000 pcs. Visiting cards: 2000. Bill books: 10-20 pads.
- Do not send payment terms unless the customer asks about payment or is ready to order.
- Medicine pouches, keychains, pens, paperweights, pen stands, and mobile stands take around 15 days for production.
- Stickers take around 3 days for production.
- Other items like files, letterpads, non-woven bags and similar products follow normal production timelines. Do not ask for deadline.
- Website: www.rareprint.in
- GST number: 27GEKPP2259Q1ZI. Customer can verify it on the GST portal.
- Rareprint is listed on Amazon, IndiaMART, and TradeIndia.

HOW TO TALK:
- Max 2-3 lines per message. Never write essays.
- No bullet points, no bold headers, no formatted lists in replies.
- Ask ONE question at a time, not 4 questions together.
- Sound like a real person texting, not a bot reading a script.
- Use very few emojis.
- Do not ask for delivery time or deadline.
- When customer asks about a product, product rates/details are sent automatically first. After that, ask only one useful follow-up.
- Do not take orders for odd quantities. Only accept quantities mentioned in Rareprint rates/website.

SALES FLOW:
1. Greet simply and respectfully.
2. If product is detected, system sends rates/details automatically. Do not repeat rates unless asked.
3. Ask SPIN-style questions one by one:
   - City?
   - Currently which pouches/items are they using?
   - Are their current pouches printed or plain?
   - Which services/products do they offer: home delivery, discounts, doctor/path lab tie-ups, cosmetics, cold drinks, nutrition, surgical, veterinary, pet food, or any other business?
4. If they offer services but use plain/unprinted pouches, explain the missed marketing income and repeat-customer opportunity.
5. When ready to order, use [SEND_PAYMENT_LINK].

OBJECTION HANDLING:
- Medicine pouch rate issue:
  Explain that Rareprint uses 70 GSM white paper, not raddi paper. It is multicolor printing, not single-color printing. Higher quantities like 10,000 onward get better rates. You may offer 5% discount when needed. For 10,000 medicine pouches, mention 10,000 ready-made prescription stickers free.
  Explain ROI simply: 10,000 pouches can bring even 1% repeat customers = 100 customers. If each buys medicines worth Rs 500 average, that is Rs 50,000 sales. Compare that with pouch investment: possible 5-10x ROI, plus reputation, repeat customers, and promotion for home delivery, discounts, doctor/path lab tie-ups, cosmetics, cold drinks, nutrition, surgical, veterinary, pet food, or any other business.
- Quantity issue:
  Explain that multicolor high-quality printing needs minimum quantity to keep cost low. For medicine pouches, negotiate on quantity. If customer still refuses, offer 2,000 pouches and say rate will be shared soon. Explain pouches are non-perishable and a medical shop continues for years, so 5,000 quantity is practical. If new business, printed pouch is useful for marketing.
- Trust issue:
  Share GST number 27GEKPP2259Q1ZI and ask them to verify on GST portal. Mention website, Amazon, IndiaMART, TradeIndia listings, and customers in every city. Ask their city so Rareprint can share nearby customer references. Offer video call during office time to see the office.
- Price high generally:
  Connect quality, marketing ROI, and better quantity pricing. Do not sound defensive.
- Thinking:
  Ask one helpful follow-up question, not generic pressure.

RULES:
- Never share phone numbers or email unless the customer asks for contact details.
- Never make up prices.
- One question at a time.
- Understand the customer's writing/language, including Hindi, Marathi, English, Hinglish, and other Indian languages/scripts.
- Always reply in the same language/script the customer uses. If they mix languages, reply in the same mixed style.
- If the customer's message is unclear because of spelling, transliteration, or mixed script, infer the likely meaning from context and ask one short clarifying question in their language.
- Keep product names, quantities, prices, website, GST number, and technical print terms accurate even when translating.
- [SEND_PAYMENT_LINK] when customer wants to order or asks how to pay.
- [UNSUBSCRIBE] if they say STOP.
- [ESCALATE] if too complex.
- If customer asks for all products, send the all-products PDF/catalog and do not ask quantity first.
- If customer sends an image/document and image reading is unavailable, politely ask them to type the key details visible in the file.
""".strip()


# ── Agent class ──────────────────────────────────────────────────────────────
class SalesAgent:
    def __init__(self, store: ConversationStore, client: AiSensyClient):
        self.store  = store
        self.client = client
        self.ai     = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

        if not self.ai:
            logger.warning("ANTHROPIC_API_KEY not set — AI responses disabled")

    async def handle_message(self, msg: dict):
        phone = msg["phone"]
        name  = msg["name"]
        text  = msg["text"]
        message_id = msg.get("message_id", "")

        logger.info(f"📨 {phone} ({name}): {text[:80]}")

        if self.store.already_seen_message(phone, message_id):
            logger.info(f"Skipping duplicate message {message_id} for {phone}")
            return

        language_hint = self._detect_language_hint(text)
        self.store.update_lead(phone, language_hint=language_hint)

        if msg.get("media_type", "").lower() in ["image", "photo"] and msg.get("media_url"):
            image_note = self._describe_image(msg["media_url"])
            if image_note:
                text = f"{text}\n\n[IMAGE DATA: {image_note}]".strip()

        # ── Store customer message ────────────────────────────────────────────
        ad_headline = msg.get("ad_headline", "")
        display_text = text.replace(f"[FROM AD: {ad_headline}] ", "") if ad_headline else text
        self.store.add_message(phone, "user", display_text)
        self.store.update_lead(phone, name=name)
        if ad_headline:
            self.store.update_lead(phone, ad_source=ad_headline)

        self._capture_answer_to_last_question(phone, text)
        self._extract_lead_data(phone, text)

        # ── Check for unsubscribe ─────────────────────────────────────────────
        if text.lower().strip() in ["stop", "unsubscribe", "opt out"]:
            self.store.set_state(phone, "unsubscribed")
            self.client.send_text(phone, "✅ You've been unsubscribed. We won't message you again.")
            return

        state = self.store.get_state(phone)
        if state == "unsubscribed":
            return  # silently ignore

        if self._is_all_products_request(text):
            if ALL_PRODUCTS_PDF_URL:
                self.client.send_document(
                    phone,
                    ALL_PRODUCTS_PDF_URL,
                    "Rareprint all products catalog.pdf",
                    "Sir/Madam, ye Rareprint ka all-products catalog hai."
                )
            else:
                self.client.send_text(
                    phone,
                    "Sir/Madam, all products yahan dekh sakte hain: https://www.rareprint.in"
                )
            self.store.add_message(phone, "assistant", "[Sent all products catalog]")
            return

        # ── Detect product interest ───────────────────────────────────────────
        product = get_product_by_keyword(text)
        template_sent = False

        if product:
            current_product = self.store.get_session(phone).get("lead", {}).get("product")
            # Only send template if it's a new/different product inquiry
            if current_product != product["name"]:
                logger.info(f"🛒 Product detected: {product['name']} for {phone}")
                # Send the fixed template immediately
                self.client.send_product_template(phone, product)
                self.store.update_lead(phone, product=product["name"])
                self.store.set_state(phone, "product_sent")
                template_sent = True

        # ── Generate AI reply ─────────────────────────────────────────────────
        ai_reply = self._get_ai_reply(
            phone,
            name,
            text,
            product,
            template_sent,
            msg.get("ad_headline", ""),
            language_hint,
        )

        if not ai_reply:
            return

        # ── Execute special commands ──────────────────────────────────────────
        if "[SEND_PAYMENT_LINK]" in ai_reply:
            ai_reply = ai_reply.replace("[SEND_PAYMENT_LINK]", "").strip()
            # Find the product for this conversation
            lead = self.store.get_lead(phone)
            p_name = lead.get("product")
            p_obj = next((p for p in PRODUCTS.values() if p["name"] == p_name), None)
            if p_obj:
                self.client.send_payment_link(phone, p_obj)
            self.store.set_state(phone, "payment_sent")

        if "[UNSUBSCRIBE]" in ai_reply:
            ai_reply = ai_reply.replace("[UNSUBSCRIBE]", "").strip()
            self.store.set_state(phone, "unsubscribed")

        if "[ESCALATE]" in ai_reply:
            ai_reply = ai_reply.replace("[ESCALATE]", "").strip()
            # Notify human agent (implement via Slack/email/AiSensy alert as needed)
            logger.warning(f"🚨 ESCALATION requested for {phone}")

        # ── Send AI reply ─────────────────────────────────────────────────────
        if ai_reply:
            self.client.send_text(phone, ai_reply)
            self.store.add_message(phone, "assistant", ai_reply)
            self._remember_question_from_reply(phone, ai_reply)

    def _get_ai_reply(
        self,
        phone: str,
        name: str,
        text: str,
        product: dict | None,
        template_just_sent: bool,
        ad_headline: str = "",
        language_hint: str = "same as customer",
    ) -> str:
        if not self.ai:
            # Fallback if no API key
            return (
                f"Hi {name}! 👋 Thank you for your message. "
                f"Please contact us at {BUSINESS_PHONE} for more details."
            )

        history = self.store.get_history(phone)
        lead = self.store.get_lead(phone)
        flags = self.store.get_conversation_flags(phone)

        # Build context note for AI
        context_note = self._build_known_context(lead, flags, language_hint)

        if ad_headline and not template_just_sent:
            context_note += (
                f"\n\n[SYSTEM NOTE: Customer clicked your Facebook/Instagram ad: '{ad_headline}'. "
                f"They sent a generic greeting. DON'T ask 'what do you want to print?' — "
                f"you already know they're interested in '{ad_headline}'. "
                f"Greet them and directly ask about their requirement for that product. "
                f"Keep it short — 1-2 lines max.]"
            )
        elif template_just_sent and product:
            context_note += (
                f"\n\n[SYSTEM NOTE: Rates for '{product['name']}' just sent. Don't repeat prices. "
                f"Ask quantity only if quantity is not already known; otherwise ask the next unanswered SPIN question.]"
            )
        elif product:
            context_note += (
                f"\n\n[SYSTEM NOTE: Rates for '{product['name']}' already sent earlier. Just help them order.]"
            )

        # Build messages for Claude
        messages = []
        for m in history[:-1]:   # exclude the just-added current message
            messages.append({"role": m["role"], "content": m["content"]})

        # Current user message with context note
        messages.append({"role": "user", "content": text + context_note})

        try:
            system = CUSTOM_SYSTEM_PROMPT if CUSTOM_SYSTEM_PROMPT else build_system_prompt()
            response = self.ai.messages.create(
                model="claude-haiku-4-5",
                max_tokens=200,
                system=system,
                messages=messages,
            )
            reply = response.content[0].text.strip()
            logger.info(f"🤖 AI reply to {phone}: {reply[:80]}")
            return reply
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return self._fallback_reply(name, text, product, template_just_sent)

    def _fallback_reply(
        self,
        name: str,
        text: str,
        product: dict | None,
        template_just_sent: bool,
    ) -> str:
        lowered = text.lower()
        if any(word in lowered for word in ["stop", "unsubscribe", "opt out"]):
            return "[UNSUBSCRIBE]"
        if any(word in lowered for word in ["pay", "payment", "upi", "advance", "order confirm", "book order"]):
            return "Sir/Madam, order confirm karne ke liye payment details bhej raha hoon. [SEND_PAYMENT_LINK]"
        if any(word in lowered for word in ["high", "mahanga", "mehnga", "zyada", "expensive", "rate issue"]):
            return (
                "Sir/Madam, medicine pouch mein hum 70 GSM white paper aur multicolor printing use karte hain, raddi/single color nahi. "
                "10,000 qty par better rate, 5% discount aur 10,000 prescription stickers free de sakte hain."
            )
        if any(word in lowered for word in ["trust", "bharosa", "fake", "gst", "proof"]):
            return (
                "Sir/Madam, Rareprint ka GST 27GEKPP2259Q1ZI hai, aap GST portal par verify kar sakte hain. "
                "Hum Amazon, IndiaMART aur TradeIndia par bhi listed hain. Aapka city bata dijiye, nearby reference share karenge."
            )
        if template_just_sent and product:
            return f"Sir/Madam, {product['name']} ke rates/details share kar diye. Aap kitni quantity plan kar rahe hain?"
        if product:
            return f"Sir/Madam, {product['name']} ke liye aapka city bata dijiye, main requirement ke hisab se guide karta hoon."
        return "Sir/Madam, aapko kaunsa product print karwana hai? Medicine pouch, stickers, bill book, letterpad, bag, file ya visiting card?"

    def _build_known_context(self, lead: dict, flags: dict, language_hint: str) -> str:
        known = {
            "product": lead.get("product"),
            "quantity": lead.get("quantity"),
            "city": lead.get("city") or lead.get("pincode"),
            "current_pouches": lead.get("current_pouches"),
            "printed_status": lead.get("printed_status"),
            "services": lead.get("services"),
            "email": lead.get("email"),
        }
        known_text = ", ".join(f"{k}={v}" for k, v in known.items() if v)
        asked = ", ".join(flags.get("asked_questions") or [])
        last_q = flags.get("last_question_key") or ""
        return (
            "\n\n[SYSTEM MEMORY: "
            f"Known details: {known_text or 'none yet'}. "
            f"Already asked: {asked or 'none'}. Last question: {last_q or 'none'}. "
            "If the customer's latest message answers the last question, do not ask it again. "
            "Ask only the next unanswered question. Never repeat quantity, city, current pouch, printed/plain, or services questions once known. "
            f"Language/script hint: {language_hint}. Reply in this same language/script unless the customer changes language.]"
        )

    def _is_all_products_request(self, text: str) -> bool:
        text_lower = text.lower()
        return any(trigger in text_lower for trigger in ALL_PRODUCTS_TRIGGERS)

    def _detect_language_hint(self, text: str) -> str:
        if not text.strip():
            return "same as customer"
        ranges = [
            ("Devanagari Hindi/Marathi", "\u0900", "\u097f"),
            ("Bengali", "\u0980", "\u09ff"),
            ("Gurmukhi Punjabi", "\u0a00", "\u0a7f"),
            ("Gujarati", "\u0a80", "\u0aff"),
            ("Odia", "\u0b00", "\u0b7f"),
            ("Tamil", "\u0b80", "\u0bff"),
            ("Telugu", "\u0c00", "\u0c7f"),
            ("Kannada", "\u0c80", "\u0cff"),
            ("Malayalam", "\u0d00", "\u0d7f"),
            ("Arabic/Urdu", "\u0600", "\u06ff"),
        ]
        hits = []
        for name, start, end in ranges:
            count = sum(1 for char in text if start <= char <= end)
            if count:
                hits.append((name, count))
        latin = sum(1 for char in text if char.isalpha() and ord(char) < 128)
        if latin:
            hits.append(("Latin English/Hinglish/transliteration", latin))
        if not hits:
            return "same as customer"
        hits.sort(key=lambda item: item[1], reverse=True)
        if len(hits) >= 2 and hits[1][1] >= max(2, hits[0][1] * 0.25):
            return f"mixed {hits[0][0]} + {hits[1][0]}"
        return hits[0][0]

    def _describe_image(self, image_url: str) -> str:
        if not self.ai:
            return ""
        try:
            import httpx

            resp = httpx.get(image_url, timeout=12)
            resp.raise_for_status()
            media_type = resp.headers.get("content-type", "").split(";")[0].strip()
            if not media_type.startswith("image/"):
                media_type = mimetypes.guess_type(image_url)[0] or "image/jpeg"
            image_b64 = base64.b64encode(resp.content).decode("ascii")

            response = self.ai.messages.create(
                model="claude-haiku-4-5",
                max_tokens=250,
                system=(
                    "Extract useful sales/order details from this customer image for a printing shop. "
                    "Mention visible product type, text, size, quantity, colors, contact details, or design notes. "
                    "If unclear, say what is unclear. Keep it concise."
                ),
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Read this image and extract order/sales details.",
                        },
                    ],
                }],
            )
            return response.content[0].text.strip()
        except Exception as e:
            logger.warning(f"Image reading failed: {e}")
            return ""

    def _capture_answer_to_last_question(self, phone: str, text: str):
        flags = self.store.get_conversation_flags(phone)
        last_q = flags.get("last_question_key")
        value = text.strip()
        if not last_q or not value:
            return

        if last_q == "city" and not self.store.get_lead(phone).get("city"):
            if not re.search(r"\d", value) and len(value.split()) <= 4:
                self.store.update_lead(phone, city=value)
        elif last_q == "current_pouches":
            self.store.update_lead(phone, current_pouches=value)
        elif last_q == "printed_status":
            lowered = value.lower()
            if any(word in lowered for word in ["plain", "normal", "simple", "without", "no print", "not printed"]):
                self.store.update_lead(phone, printed_status="plain/unprinted")
            elif any(word in lowered for word in ["printed", "print", "color", "colour"]):
                self.store.update_lead(phone, printed_status="printed")
            else:
                self.store.update_lead(phone, printed_status=value)
        elif last_q == "services":
            self.store.update_lead(phone, services=value)

    def _remember_question_from_reply(self, phone: str, reply: str):
        text = reply.lower()
        if "city" in text or "which city" in text or "aap kaha" in text or "kahan" in text or "shehar" in text:
            self.store.mark_question_asked(phone, "city")
        elif "currently" in text and ("pouch" in text or "using" in text):
            self.store.mark_question_asked(phone, "current_pouches")
        elif "printed" in text or "plain" in text:
            self.store.mark_question_asked(phone, "printed_status")
        elif any(word in text for word in ["home delivery", "discount", "doctor", "path lab", "cosmetic", "cold drink", "nutrition", "surgical", "veterinary", "pet food", "services"]):
            self.store.mark_question_asked(phone, "services")
        elif any(word in text for word in ["quantity", "qty", "kitni", "kitna"]):
            self.store.mark_question_asked(phone, "quantity")

    def _extract_lead_data(self, phone: str, text: str):
        """
        Simple regex extraction of structured data from customer messages.
        Supplements AI collection.
        """
        # Email
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", text)
        if email_match:
            self.store.update_lead(phone, email=email_match.group())

        # Quantity patterns: "500 pcs", "1000 copies", "2000 qty"
        qty_match = re.search(r"(\d+)\s*(pcs?|pieces?|copies|qty|nos?\.?)", text, re.I)
        if qty_match:
            self.store.update_lead(phone, quantity=qty_match.group())

        # City / pincode
        pin_match = re.search(r"\b([1-9][0-9]{5})\b", text)
        if pin_match:
            self.store.update_lead(phone, pincode=pin_match.group())
