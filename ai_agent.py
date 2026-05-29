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

        logger.info(f"📨 {phone} ({name}): {text[:80]}")

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

        # ── Extract lead data from conversation ───────────────────────────────
        self._extract_lead_data(phone, text)

    def _get_ai_reply(
        self,
        phone: str,
        name: str,
        text: str,
        product: dict | None,
        template_just_sent: bool,
        ad_headline: str = "",
    ) -> str:
        if not self.ai:
            # Fallback if no API key
            return (
                f"Hi {name}! 👋 Thank you for your message. "
                f"Please contact us at {BUSINESS_PHONE} for more details."
            )

        history = self.store.get_history(phone)

        # Build context note for AI
        context_note = ""

        if ad_headline and not template_just_sent:
            context_note = (
                f"\n\n[SYSTEM NOTE: Customer clicked your Facebook/Instagram ad: '{ad_headline}'. "
                f"They sent a generic greeting. DON'T ask 'what do you want to print?' — "
                f"you already know they're interested in '{ad_headline}'. "
                f"Greet them and directly ask about their requirement for that product. "
                f"Keep it short — 1-2 lines max.]"
            )
        elif template_just_sent and product:
            context_note = (
                f"\n\n[SYSTEM NOTE: Rates for '{product['name']}' just sent. Don't repeat prices. Ask quantity.]"
            )
        elif product:
            context_note = (
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
            return "Ek second rukiye... 🙏 Main abhi check karke batata hoon."

    def _is_all_products_request(self, text: str) -> bool:
        text_lower = text.lower()
        return any(trigger in text_lower for trigger in ALL_PRODUCTS_TRIGGERS)

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
