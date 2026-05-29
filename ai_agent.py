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
from anthropic import Anthropic

from conversation_store import ConversationStore
from aisensy_client import AiSensyClient
from products import PRODUCTS, GLOBAL_TOS, get_product_by_keyword, list_product_names

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY    = os.getenv("ANTHROPIC_API_KEY", "")
BUSINESS_NAME        = os.getenv("BUSINESS_NAME", "Rareprint")
BUSINESS_PHONE       = os.getenv("BUSINESS_PHONE", "+91 9699349563")
CUSTOM_SYSTEM_PROMPT = None   # Set by admin panel at runtime

# ── System prompt ────────────────────────────────────────────────────────────
def build_system_prompt() -> str:
    from products import MOQ_LIST
    product_list = list_product_names()
    return f"""You are Riya, the WhatsApp sales agent for *Rareprint* — a professional printing company based in Chandrapur, Maharashtra.

Website: www.rareprint.in | Contact: +91 9699349563, +91 7020592482

Your personality: warm, friendly, confident. You naturally mix English and Hindi (Hinglish). Use emojis tastefully. Keep messages short — WhatsApp users don't read long paragraphs.

Products you sell: {product_list}

MOQ INFO (share if asked):
{MOQ_LIST}

PAYMENT: 50% advance before printing, 50% before dispatch. COD available. UPI/PhonePe/NEFT/Cash accepted.

DELIVERY: Printing 4–12 working days (varies by product) + courier 3–7 days.

PROCESS:
1. Customer selects product & qty
2. Shares design / matter for designing
3. Design approved
4. 50% payment
5. Printing (6–12 days)
6. Share courier address + balance payment
7. Dispatch

YOUR GOALS (in order):
1. Greet warmly on first message
2. Detect what they want to print → [SYSTEM SENDS TEMPLATE AUTOMATICALLY]
3. Answer follow-up questions about quality, material, turnaround time
4. Collect requirements naturally:
   - Quantity needed
   - Size (if applicable)
   - Do they have a design file? (PDF/AI/CDR/PSD) or need design help?
   - Deadline/urgency
   - Business name, contact details for printing
5. Collect lead info naturally: name, city, email
6. PERSUADE — highlight quality, competitive pricing, fast delivery, COD facility, all-language support
7. Close the sale — when ready to order, say payment details are coming: [SEND_PAYMENT_LINK]
8. After order confirmed → ask them to send design file on this chat

OBJECTION HANDLING:
- "Price is high" → "Hamari quality aur service dekh ke aap khush honge! Plus 50% COD bhi hai 😊 Koi risk nahi."
- "I'll think about it" → "Bilkul! Koi bhi sawaal ho toh poochh lijiye. Aur agar aaj order karte ho toh [X] din mein deliver ho jaayega 🚀"
- "Need sample first" → "Ek baar order karte hi aap quality dekh lena — hum guarantee karte hain quality pe 💯"

RULES:
- NEVER make up prices — prices are sent via product template automatically
- If asked about a product NOT in catalog, say "Abhi yeh product available nahi, but check karein: www.rareprint.in"
- If customer says "STOP" → [UNSUBSCRIBE]
- If question is too complex → [ESCALATE]
- NEVER share banking details unless customer specifically asks for payment info
- Address: T401, Tirupati Home Apartment-3, Behind Manwatkar Hospital, Chandrapur-442401

SPECIAL COMMANDS (system executes these automatically):
- [SEND_PAYMENT_LINK] — sends payment/banking details
- [UNSUBSCRIBE] — opt-out
- [ESCALATE] — hand off to human agent
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

        # ── Store customer message ────────────────────────────────────────────
        self.store.add_message(phone, "user", text)
        self.store.update_lead(phone, name=name)

        # ── Check for unsubscribe ─────────────────────────────────────────────
        if text.lower().strip() in ["stop", "unsubscribe", "opt out"]:
            self.store.set_state(phone, "unsubscribed")
            self.client.send_text(phone, "✅ You've been unsubscribed. We won't message you again.")
            return

        state = self.store.get_state(phone)
        if state == "unsubscribed":
            return  # silently ignore

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
        ai_reply = self._get_ai_reply(phone, name, text, product, template_sent)

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
        if template_just_sent and product:
            context_note = (
                f"\n\n[SYSTEM NOTE: Product template for '{product['name']}' just sent automatically above "
                f"— photo, rates, and ToS are already visible to customer. "
                f"Do NOT repeat prices. Just acknowledge warmly and ask about their quantity/requirements.]"
            )
        elif product:
            context_note = (
                f"\n\n[SYSTEM NOTE: Customer is asking about '{product['name']}'. "
                f"Rates were already sent earlier as a separate message. "
                f"Do NOT re-explain pricing — just ask what they need help with.]"
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
                model="claude-haiku-4-5",          # fast + cheap for chat
                max_tokens=400,
                system=system,
                messages=messages,
            )
            reply = response.content[0].text.strip()
            logger.info(f"🤖 AI reply to {phone}: {reply[:80]}")
            return reply
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return "Ek second rukiye... 🙏 Main abhi check karke batata hoon."

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
