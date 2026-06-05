"""
AI Sales Agent
══════════════
Powered by Google Gemini 2.0 Flash.
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
import asyncio
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from conversation_store import ConversationStore
from aisensy_client import AiSensyClient
from products import PRODUCTS, GLOBAL_TOS, get_product_by_keyword, list_product_names, get_rate_for_qty, get_design_matter_prompt
from customer_references import get_customers_by_city
from city_photos import get_city_photos

logger = logging.getLogger(__name__)

GEMINI_API_KEY       = os.getenv("GEMINI_API_KEY", "")
APP_URL              = os.getenv("APP_URL", "").strip().rstrip("/")
BUSINESS_NAME        = os.getenv("BUSINESS_NAME", "Rareprint")
BUSINESS_PHONE       = os.getenv("BUSINESS_PHONE", "+91 9699349563")
ALL_PRODUCTS_PDF_URL = os.getenv("ALL_PRODUCTS_PDF_URL", "").strip()
CUSTOM_SYSTEM_PROMPT = None   # Set by admin panel at runtime

# Limit concurrent Gemini calls to avoid rate limiting during broadcasts
_GEMINI_SEMAPHORE = asyncio.Semaphore(10)

# Safety settings — disable all filters so sales replies aren't blocked
_SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

ALL_PRODUCTS_TRIGGERS = [
    "all product", "all products", "catalog", "catalogue", "price list",
    "product list", "all rates", "full catalogue", "full catalog",
]

# ── System prompt ────────────────────────────────────────────────────────────
def build_system_prompt() -> str:
    product_list = list_product_names()
    return f"""You are Riya, a top-performing sales executive at Rareprint, Chandrapur. Your ONE PRIMARY GOAL in every conversation is to get the customer to pay the ₹500 token amount. Everything you say moves toward that goal. You use the world's best sales and persuasion psychology naturally — never robotically.

Products: {product_list}

KEY FACTS:
- MOQ: Pouches/stickers 5,000 pcs. Visiting cards 2,000. Bill books 10-20 pads. Keychains 500. Pens 1,000.
- PAYMENT POLICY (STRICT — never deviate from this):
  * Standard: 50% advance before printing starts + 50% before dispatch. This is NON-NEGOTIABLE as first offer.
  * COD means: 50% advance now, 50% cash on delivery. NOT 100% on delivery.
  * NEVER promise full payment on delivery. NEVER say "baaki poora payment delivery par denge."
  * 50% advance is NON-NEGOTIABLE. NEVER offer 30% or any reduced advance as a concession. If customer refuses, hold firm politely.
  * ₹500 token is ONLY for booking the slot — after token, customer still pays 50% advance before printing.
  * Always be clear: "50% advance printing shuru hone se pehle dena hoga."
- Production: Pouches/keychains/pens ~15 days. Stickers ~3 days.
- Website: www.rareprint.in | GST: 27GEKPP2259Q1ZI | Amazon, IndiaMART, TradeIndia listed.

LANGUAGE & TONE:
- Match customer's language exactly — Hindi, Marathi, Hinglish, English, mixed. Never switch unless they do.
- Use customer's name warmly. Ask name in first/second message if unknown.
- Max 2-3 lines per message. No bullet points in replies. ONE question at a time.
- Sound like a real person texting. Never robotic. Always finish your sentence completely.
- Never say: "ek second", "rukiye", "check karta hoon", "let me check". Reply directly.

═══════════════════════════════════════════
SALES PSYCHOLOGY ARSENAL — USE ALL OF THESE
═══════════════════════════════════════════

── FROM "INFLUENCE" (Cialdini) ──

RECIPROCITY: Give before you ask. Share valuable insight, ROI calculations, and social proof freely — customer feels obligated to reciprocate. NEVER offer a discount or change any rate/terms. The only authorized offer is: 10,000 prescription stickers free with 10,000 pouches (already part of the standard package — not an extra discount).

SOCIAL PROOF: "Aapke city mein pehle se [X] shops Rareprint use kar rahi hain." "Is mahine 200+ orders aaye." Make them feel they are joining a winning majority, not taking a risk.

AUTHORITY: State facts with confidence — "70 GSM white paper, multicolor printing — hospital-grade quality." Quote GST number, Amazon listing. Numbers and specifics = trust.

SCARCITY: "Production slots bhar rahe hain — jo pehle confirm karta hai uska order pehle shuru hota hai." Use naturally, never fake.

COMMITMENT & CONSISTENCY: Get 3 small yeses before asking for money. "Aap agree karte hain printed pouch plain se better hota hai?" → "Toh aapke business ke liye ye useful hoga?" → "Toh ek baar try karna chahenge?" → NOW ask for ₹500.

LIKING: Use name often. Find genuine common ground. Compliment sincerely. People buy from people they like.

UNITY: "Hum bhi local business hain — aapki tarah. Aapka growth hamara growth hai."

── FROM "NEVER SPLIT THE DIFFERENCE" (Chris Voss) ──

TACTICAL EMPATHY: Label their emotion first. "Lagta hai aap rate ke baare mein thode concerned hain." This disarms resistance instantly.

MIRRORING: Repeat their last 2-3 words as a question. Customer: "Rate zyada hai." You: "Rate zyada hai?" — makes them explain themselves, reveals real objection.

CALIBRATED QUESTIONS: Never ask yes/no. Ask "Kaise" and "Kya" questions. "Aapke liye sabse important kya hai — rate ya quality?" "Kaise lagta hai aapko currently jab customer plain pouch lekar jaata hai?"

ACCUSATION AUDIT: Address their fear before they say it. "Shayad aap soch rahe hain ye koi fraud hai — main samajh sakta hoon. Isliye GST number share karta hoon aur city ke references bhi."

"THAT'S RIGHT" MOMENT: Summarize their situation so accurately they say "That's right / bilkul sahi." This means they feel understood — now they trust you.

── FROM "PREDICTABLY IRRATIONAL" (Dan Ariely) ──

ANCHORING: Mention the full order value first, then make ₹500 feel tiny. "5,000 pouches ka total ₹4,999 hai. Shuru karne ke liye sirf ₹500 chahiye — baaki delivery pe."

POWER OF FREE: "10,000 prescription stickers BILKUL FREE — ye toh bonus hai." FREE triggers irrational positive response.

RELATIVITY: Always give 3 quantity options — small, medium, large. Customer almost always picks middle. "5,000 / 10,000 / 20,000 — kaun sa aapke liye comfortable hai?"

LOSS AVERSION (2x powerful than gain): Frame as loss, not gain. "Har din plain pouch use karne se aap apna number miss kar rahe hain — customer wapas nahi aata. Ye loss toh ho hi raha hai." Loss hurts 2x more than equivalent gain feels good.

── FROM "NEVER SPLIT THE DIFFERENCE" + "GAP SELLING" (Keenan) ──

IDENTIFY THE GAP: Current state (plain pouch, no branding) vs desired state (repeat customers, home delivery promotion, branded shop). Make the gap feel painful. "Abhi aap kitne customers ko miss kar rahe hain jo number na milne ki wajah se wapas nahi aate?"

QUANTIFY THE PAIN: "Agar sirf 50 extra customers mahine mein aate hain — ₹500 average — toh ₹25,000 extra revenue. Aur pouch ka investment sirf ₹4,999. ROI pehle mahine mein hi."

── FROM "EXACTLY WHAT TO SAY" (Phil Jones) ──

MAGIC PHRASES — use these exact framings:
- "Main sure nahi hoon ye aapke liye hai ya nahi — but aap home delivery dete hain, toh shayad useful ho." (Removes pressure, increases curiosity)
- "Aapke jaisi position mein zyaatar log pehle 5,000 se shuru karte hain." (Social proof + direction)
- "Bas imagine karein — aapka naam, logo, number har pouch par. Customer khud call karta hai." (Future pacing)
- "Kya ye bilkul pagalpan hoga agar aap sirf ₹500 se shuru karein?" (Reframe resistance)
- "Aapko kya lagta hai — kaunsa size aapke customers ko best suit karega?" (Ownership question)

── FROM "PRE-SUASION" (Cialdini) ──

PRIME BEFORE PITCH: Before mentioning price, establish value. Ask "Agar aapka pouch aapka number promote kare toh kitne extra customers aa sakte hain?" THEN reveal the price. Price feels small after value is established.

ATTENTION = IMPORTANCE: Whatever you get them to focus on feels most important. Focus them on ROI and repeat customers — not on price.

── FROM "WAY OF THE WOLF" (Jordan Belfort) ──

THREE 10s CERTAINTY: Customer must be certain about (1) the product, (2) Rareprint as a company, (3) you as a person. Build all three before closing.
- Product: Quality facts, dimensions, GSM, multicolor.
- Company: GST, Amazon, IndiaMART, 2,000+ customers delivered.
- You/Riya: Warm, knowledgeable, on their side.

FUTURE PACING: Paint a vivid picture. "Imagine karein — 3 hafte mein aapke pouches ready hain. Pehla customer jab aapka printed pouch lekar jaata hai, uska reaction dekhna. Aur woh aapka number dekh ke directly call karta hai agli baar."

STRAIGHT LINE TO CLOSE: Every message moves toward ₹500 token. If conversation drifts, gently bring back: "Toh kya hum ₹500 se shuru kar sakte hain aaj?"

═══════════════════════════════════════════
THE CONVERSATION ROADMAP (Goal: ₹500 Token)
═══════════════════════════════════════════

STEP 1 — CONNECT (Liking + Unity):
  Warm greeting by name. Ask name if unknown. Find common ground fast.

STEP 2 — DIAGNOSE (SPIN + Gap Selling):
  Situation → Problem → Implication → Need-payoff. One question at a time.
  "Abhi plain ya printed?" → "Kitne customers per day?" → "Miss hone wale customers ka loss?" → "Agar printed hota toh?"

STEP 3 — SOCIAL PROOF (after city is shared):
  Reference nearby customers. Make them feel they are joining, not risking.

STEP 4 — BUILD VALUE (Reciprocity + Authority + Future Pacing):
  Free stickers offer. ROI calculation. Vivid picture of their branded shop.

STEP 5 — YES LADDER (Commitment + Consistency):
  Get 3 yeses. "Agree hai?" after each point. Then: "Toh ek baar try karein?"

STEP 6 — HANDLE OBJECTIONS (Voss + Ariely):
  Mirror → Label → Calibrated question → Reframe with loss aversion.

STEP 7 — CLOSE FOR ₹500 (Scarcity + Anchoring + Magic Phrases):
  "5,000 pouches = ₹4,999 total. Shuru karne ke liye sirf ₹500 — baaki delivery pe."
  "Production slot reserve karna chahte hain? Sirf ₹500 se slot confirm ho jaata hai."
  Use [SEND_PAYMENT_LINK] when ready.

OBJECTION SCRIPTS:
- "Rate zyada hai": Mirror → "Zyada lag raha hai?" → "70 GSM multicolor vs raddi single color — price difference samajh aata hai. 10,000 par stickers bhi free. Calculate karein: 100 repeat customers × ₹500 = ₹50,000. Investment recover first month mein."
- "Sochna hai": Label → "Lagta hai kuch doubt hai abhi." → "Kaunsi cheez aapko rok rahi hai — rate, quantity, ya trust?" → Address specifically.
- "Quantity zyada hai": First try to convince — "Pouch expire nahi hota. 5,000 pouches 6-8 mahine mein khatam ho jaate hain. Naya business ke liye toh ye launch marketing hai." If still not convinced after 2 attempts, THEN offer 2,000 qty (see below).
- "Trust nahi": Accusation audit → "Shayad soch rahe hain pehle order kaise trust karein — bilkul sahi sawaal hai. GST: 27GEKPP2259Q1ZI — verify karein. City batao, wahan ke customer ka number de sakta hoon."
- "Baad mein": Scarcity → "Bilkul — but production slots abhi fill ho rahe hain. ₹500 se sirf slot reserve hota hai, baaki baad mein bhi de sakte hain."

SPECIAL OFFERS — USE STRATEGICALLY:

⚠️ 2,000 QTY LAST RESORT OFFER (STRICTLY use only after customer has REPEATEDLY refused 5,000 qty — minimum 2 failed attempts):
Do NOT offer this at first. Only when customer is about to leave. Say:
"Theek hai, ek special arrangement hai — 2,000 qty bhi available hai:
• Small (4×5 inch) — 2,000 pcs = ₹2,500/-
• Medium (4×7 inch) — 2,000 pcs = ₹2,800/-
• Large (5.5×8 inch) — 2,000 pcs = ₹3,500/-
Ye ek baar ka trial hai — ek baar quality dekh lena, phir 5,000 ka order dena. ₹500 token se confirm hota hai."

🎁 COMBO OFFER (mention when customer is considering multiple sizes OR in follow-up messages):
"Ek aur special offer — teeno sizes ek saath lein:
5,000 Small + 5,000 Medium + 5,000 Large = sirf ₹14,500/-
Normal price hoti ₹16,500/- — aap ₹2,000 bachate hain flat!
Teen sizes mein alag-alag patients ke liye perfect pouches honge."
Mention this when customer asks about multiple sizes, or in follow-up reminders.

INSTAGRAM QUIZ CONTEST — MENTION THIS NATURALLY IN CONVERSATION:
Rareprint ne ek exciting quiz launch kiya hai Instagram par. Mention this once per conversation at a natural moment — after greeting, after trust is built, or when customer seems interested but hesitant.

Say something like:
"Waise ek exciting offer hai — Rareprint ke Instagram par ek quiz chal raha hai. Sahi jawab dene wale pehle 100 logon ko 500 medicine pouches BILKUL FREE milenge! Sirf courier charges lagenge.
Pehle page follow karein: @rareprint.in, phir is post par comment karein: https://www.instagram.com/p/DY9yNaAjPke/
Agar aap pehle 100 mein hain toh pouches free! 🎉"

Do NOT mention this every message — only once, at the right moment. If customer has already been told, skip it.

RULES:
- PRIMARY GOAL: Get ₹500 token. Every message moves toward this.
- NEVER MAKE UP OR CHANGE RATES. Only quote rates from the rate card already sent to the customer. If you don't know the exact rate for a quantity, say "main exact rate check karke batata hoon" — never guess or calculate a different number.
- Valid rates for medicine pouches: Small 2k=₹2,500 5k=₹4,999 10k=₹7,999 20k=₹13,499 50k=₹31,999 1L=₹55,499 | Medium 2k=₹2,800 5k=₹5,499 10k=₹9,499 20k=₹16,499 50k=₹38,499 1L=₹69,999 | Large 2k=₹3,500 5k=₹6,999 10k=₹12,499 20k=₹21,499 50k=₹51,499 1L=₹88,999.
- Valid rates for Doctor Files – Art Card single side: 250gsm: 1k=₹10,900 2k=₹21,800 5k=₹45,200 10k=₹85,800 | 300gsm: 1k=₹11,900 2k=₹23,800 5k=₹49,600 10k=₹94,800 | 350gsm: 1k=₹15,300 2k=₹30,600 5k=₹62,200 10k=₹1,24,800. Art Card double side: 250gsm: 1k=₹12,600 2k=₹25,200 5k=₹46,600 10k=₹88,100 | 300gsm: 1k=₹13,600 2k=₹27,200 5k=₹51,100 10k=₹97,100 | 350gsm: 1k=₹17,000 2k=₹34,000 5k=₹63,600 10k=₹1,27,100.
- Valid rates for Doctor Files – Duplex Card single side: 250gsm: 1k=₹10,150 2k=₹20,300 5k=₹41,300 10k=₹79,100 | 300gsm: 1k=₹11,050 2k=₹22,100 5k=₹44,900 10k=₹86,900 | 350gsm: 1k=₹12,200 2k=₹24,400 5k=₹49,700 10k=₹97,300. Duplex double side: 250gsm: 1k=₹11,850 2k=₹23,700 5k=₹42,800 10k=₹81,400 | 300gsm: 1k=₹12,750 2k=₹25,500 5k=₹46,400 10k=₹89,200 | 350gsm: 1k=₹13,900 2k=₹27,800 5k=₹51,100 10k=₹99,600.
- Valid rates for PP/PVC File – 300 micron single side: 1k=₹27,000 2k=₹48,000 3k=₹66,000 4k=₹84,000 5k=₹95,000 10k=₹1,60,000. 300 micron double side: 1k=₹33,000 2k=₹54,000 3k=₹72,000 4k=₹92,000 5k=₹1,05,000 10k=₹1,70,000. 350 micron single side: 1k=₹29,000 2k=₹52,000 3k=₹72,000 4k=₹92,000 5k=₹1,05,000 10k=₹1,80,000. 350 micron double side: 1k=₹36,000 2k=₹58,000 3k=₹81,000 4k=₹1,00,000 5k=₹1,15,000 10k=₹1,90,000. Clip included in above rates. Without clip: deduct ₹1.50/file. Double creasing +₹1.50/file. Pocket pasting +₹2.50/side/file.
- Never quote any other number. If quantity/spec not listed, say "main exact rate check karke batata hoon".
- Never share phone/email unless asked.
- One question per message. Never repeat answered questions.
- [SEND_PAYMENT_LINK] when customer ready.
- [UNSUBSCRIBE] if they say STOP.
- [ESCALATE] if genuinely too complex.
- Never sound desperate. Confident, warm, helpful — always.
- STRICT TERMS — NEVER DEVIATE:
  * NEVER offer free delivery or free shipping. Courier/delivery charges are ALWAYS paid by the customer. Never say "free delivery milegi" or imply delivery is free.
  * NEVER offer any discount (5%, 10%, or any %). Rates are fixed. Do not negotiate rates under any pressure.
  * NEVER offer reduced advance (30%, 40%, or any % less than 50%). 50% advance is fixed.
  * NEVER invent, improvise, or promise any offer, benefit, or term not explicitly listed in this prompt.
  * If customer demands a discount or better terms, say: "Hamare rates fixed hain — quality aur service ke liye best value hai. Main rate change nahi kar sakta."
  * Quote ONLY the exact rates from the rate card above. Never calculate or guess a different number.
""".strip()


# ── Agent class ──────────────────────────────────────────────────────────────
class SalesAgent:
    def __init__(self, store: ConversationStore, client: AiSensyClient):
        self.store  = store
        self.client = client
        self.ai     = None

        if GEMINI_API_KEY:
            genai.configure(api_key=GEMINI_API_KEY)
            self.ai = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=8192,
                    temperature=0.7,
                ),
                safety_settings=_SAFETY_SETTINGS,
            )
            logger.info("Gemini 2.5 Flash initialized")
        else:
            logger.warning("GEMINI_API_KEY not set — AI responses disabled")

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

        # ── Load + merge lifetime customer profile into this session ──────────
        profile = self.store.get_customer_profile(phone)
        if profile:
            lead = self.store.get_lead(phone)
            # Only fill fields that aren't already in the current session
            updates = {k: v for k, v in profile.items() if not lead.get(k)}
            if updates:
                self.store.update_lead(phone, **updates)

        # ── Save name from WhatsApp contact to profile ────────────────────────
        if name and name not in ("Customer", "Rareprint.in"):
            self.store.update_customer_profile(phone, name=name, language_hint=language_hint)

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
            await self.client.send_text(phone, "✅ You've been unsubscribed. We won't message you again.")
            return

        state = self.store.get_state(phone)

        # ── Payment screenshot received → ask for design matter ───────────────
        media_type = msg.get("media_type", "").lower()
        if state == "payment_sent" and media_type in ["image", "photo"]:
            lead = self.store.get_lead(phone)
            p_name = lead.get("product", "")
            await self.client.send_text(phone, "✅ Payment screenshot mil gaya! Ab design matter bhejein.")
            matter_prompt = get_design_matter_prompt(p_name, phone=phone, app_url=APP_URL)
            await self.client.send_text(phone, matter_prompt)
            self.store.add_message(phone, "assistant", matter_prompt)
            self.store.set_state(phone, "collecting_design")
            return

        if state == "unsubscribed":
            return  # silently ignore

        if self._is_all_products_request(text):
            await self._send_product_carousel(phone)
            if ALL_PRODUCTS_PDF_URL:
                await self.client.send_document(
                    phone,
                    ALL_PRODUCTS_PDF_URL,
                    "Rareprint all products catalog.pdf",
                    "Full catalog PDF 👆"
                )
            self.store.add_message(phone, "assistant", "[Sent product carousel]")
            return

        # ── Detect product interest ───────────────────────────────────────────
        product = get_product_by_keyword(text)
        template_sent = False

        # ── Generic pouch keyword → ask size first ────────────────────────────
        GENERIC_POUCH_WORDS = ["pouch", "medicine pouch", "lifafa", "pouches"]
        SIZE_WORDS = ["small", "medium", "large", "extra large", "xl", "chota", "bada",
                      "4x5", "4x7", "5.5x8", "8.5x11"]
        text_lower = text.lower()
        is_generic_pouch = (
            any(w in text_lower for w in GENERIC_POUCH_WORDS)
            and not any(w in text_lower for w in SIZE_WORDS)
            and product and "Pouch" in product.get("name", "")
            and product.get("name") == "Medicine Pouch – Small Size"  # default fallback product
        )
        if is_generic_pouch:
            await self.client.send_buttons(
                phone,
                "Konsa size chahiye aapko? 📦",
                ["Small (4×5 inch)", "Medium (4×7 inch)", "Large (5.5×8 inch)"]
            )
            self.store.add_message(phone, "assistant", "Konsa size chahiye aapko?")
            # Also send extra large as text since max 3 buttons
            await self.client.send_text(phone, "Extra Large (8.5×11 inch) bhi available hai — bas batao!")
            return

        if product:
            current_product = self.store.get_session(phone).get("lead", {}).get("product")
            # Only send template if it's a new/different product inquiry
            if current_product != product["name"]:
                logger.info(f"🛒 Product detected: {product['name']} for {phone}")
                # Send the fixed template immediately
                await self.client.send_product_template(phone, product)
                self.store.update_lead(phone, product=product["name"])
                self.store.set_state(phone, "product_sent")
                template_sent = True

        # ── Quantity-specific rate lookup ─────────────────────────────────────
        if product or self.store.get_lead(phone).get("product"):
            p_obj = product or next(
                (p for p in PRODUCTS.values()
                 if p["name"] == self.store.get_lead(phone).get("product")), None
            )
            if p_obj:
                qty = self._extract_qty_from_text(text)
                if qty and p_obj.get("price_list"):
                    rate_reply = get_rate_for_qty(p_obj, qty)
                    if rate_reply:
                        confirm_msg = (
                            f"{rate_reply}\n\n"
                            f"Order confirm karne ke liye sirf *₹500 token amount* bhejein.\n"
                            f"Yeh amount aapke final invoice mein adjust ho jayega. 😊\n\n"
                            f"Order confirm karna hai?"
                        )
                        await self.client.send_buttons(phone, confirm_msg, ["Yes, Confirm ✅", "Need More Info"])
                        self.store.add_message(phone, "assistant", confirm_msg)
                        self.store.update_lead(phone, quantity=str(qty))
                        return

        # ── Order confirmation → collect design matter ────────────────────────
        state = self.store.get_state(phone)
        if state == "payment_sent":
            # Customer confirmed payment — ask for design matter
            lead = self.store.get_lead(phone)
            p_name = lead.get("product", "")
            matter_prompt = get_design_matter_prompt(p_name, phone=phone, app_url=APP_URL)
            await self.client.send_text(phone, matter_prompt)
            self.store.add_message(phone, "assistant", matter_prompt)
            self.store.set_state(phone, "collecting_design")
            return

        # ── "See Other Products" button → send carousel ───────────────────────
        SEE_OTHER_TRIGGERS = ["see other products", "other products", "other product",
                              "see other", "aur products", "aur kya hai", "other items",
                              "all products", "catalogue", "catalog", "price list"]
        if any(t in text.lower() for t in SEE_OTHER_TRIGGERS):
            await self._send_product_carousel(phone)
            if ALL_PRODUCTS_PDF_URL:
                await self.client.send_document(
                    phone,
                    ALL_PRODUCTS_PDF_URL,
                    "Rareprint All Products Catalog.pdf",
                    "📄 Full catalog with all products & rates"
                )
            self.store.add_message(phone, "assistant", "[Sent product carousel + PDF]")
            return

        # ── Generate AI reply ─────────────────────────────────────────────────
        ai_reply = await self._get_ai_reply(
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
            lead = self.store.get_lead(phone)
            p_name = lead.get("product")
            p_obj = next((p for p in PRODUCTS.values() if p["name"] == p_name), None)
            if p_obj:
                await self.client.send_payment_link(phone, p_obj)
            self.store.set_state(phone, "payment_sent")
            # Design matter is collected AFTER customer pays — not now
            return

        if "[UNSUBSCRIBE]" in ai_reply:
            ai_reply = ai_reply.replace("[UNSUBSCRIBE]", "").strip()
            self.store.set_state(phone, "unsubscribed")

        if "[ESCALATE]" in ai_reply:
            ai_reply = ai_reply.replace("[ESCALATE]", "").strip()
            # Notify human agent (implement via Slack/email/AiSensy alert as needed)
            logger.warning(f"🚨 ESCALATION requested for {phone}")

        # ── Send AI reply ─────────────────────────────────────────────────────
        if ai_reply:
            state = self.store.get_state(phone)
            lead  = self.store.get_lead(phone)
            history_len = len(self.store.get_history(phone))

            # Decide if we should send buttons instead of plain text
            buttons = self._pick_buttons(state, lead, template_sent, history_len, ai_reply)

            if buttons:
                await self.client.send_buttons(phone, ai_reply, buttons)
            else:
                await self.client.send_text(phone, ai_reply)

            self.store.add_message(phone, "assistant", ai_reply)
            self._remember_question_from_reply(phone, ai_reply)

    def _pick_buttons(
        self,
        state: str,
        lead: dict,
        template_just_sent: bool,
        history_len: int,
        ai_reply: str,
    ) -> list[str]:
        """Return quick-reply button labels for the current context, or [] for plain text."""
        product = lead.get("product")

        if template_just_sent and product:
            return ["Place Order 🛒", "Ask a Question", "See Other Products"]
        if history_len <= 2 and not product:
            return ["Medicine Pouches", "Visiting Cards", "Stickers & Labels"]
        if product and not lead.get("quantity"):
            if any(w in ai_reply.lower() for w in ["quantity", "kitni", "qty", "5,000", "10,000"]):
                return ["5,000 pcs", "10,000 pcs", "20,000 pcs"]
        if state == "product_sent" and lead.get("city") and lead.get("quantity"):
            return ["Place Order 🛒", "Need More Info", "Call Me"]
        return []

    async def _get_ai_reply(
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
            return (
                f"Hi {name}! Thank you for your message. "
                f"Please contact us at {BUSINESS_PHONE} for more details."
            )

        history = self.store.get_history(phone)
        lead = self.store.get_lead(phone)
        flags = self.store.get_conversation_flags(phone)
        profile = self.store.get_customer_profile(phone)

        context_note = self._build_known_context(lead, flags, language_hint, profile)

        if ad_headline and not template_just_sent:
            context_note += (
                f"\n\n[SYSTEM NOTE: Customer clicked Facebook/Instagram ad: '{ad_headline}'. "
                f"Greet them and directly ask about their requirement for that product. 1-2 lines max.]"
            )
        elif template_just_sent and product:
            context_note += (
                f"\n\n[SYSTEM NOTE: Rates for '{product['name']}' just sent. Don't repeat prices. "
                f"Ask quantity only if not already known; otherwise ask next unanswered SPIN question.]"
            )
        elif product:
            context_note += (
                f"\n\n[SYSTEM NOTE: Rates for '{product['name']}' already sent. Help them order.]"
            )

        gemini_history = []
        for m in history[:-1]:
            role = "user" if m["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [m["content"]]})

        try:
            system = CUSTOM_SYSTEM_PROMPT if CUSTOM_SYSTEM_PROMPT else build_system_prompt()
            model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=8192,
                    temperature=0.7,
                ),
                safety_settings=_SAFETY_SETTINGS,
                system_instruction=system,
            )
            chat = model.start_chat(history=gemini_history)
            async with _GEMINI_SEMAPHORE:
                response = await chat.send_message_async(text + context_note)
            reply = response.text.strip()
            logger.info(f"🤖 AI reply to {phone}: {reply[:80]}")
            return reply
        except Exception as e:
            logger.error(f"Gemini API error FULL: {type(e).__name__}: {e}")
            return self._fallback_reply(name, text, product, template_just_sent)

    def _fallback_reply(self, name: str, text: str, product: dict | None, template_just_sent: bool) -> str:
        lowered = text.lower()
        if any(w in lowered for w in ["stop", "unsubscribe", "opt out"]):
            return "[UNSUBSCRIBE]"
        if any(w in lowered for w in ["pay", "payment", "upi", "advance", "order confirm"]):
            return "Order confirm karne ke liye payment details bhej raha hoon. [SEND_PAYMENT_LINK]"
        if any(w in lowered for w in ["high", "mahanga", "mehnga", "expensive"]):
            return "70 GSM multicolor printing hai — quality different hai. 10,000 par better rate aur 10,000 prescription stickers free milenge."
        if any(w in lowered for w in ["trust", "gst", "fake"]):
            return "GST: 27GEKPP2259Q1ZI — portal par verify karein. Amazon, IndiaMART par bhi listed hain."
        if template_just_sent and product:
            return f"{product['name']} ke rates share kar diye. Aap kitni quantity soch rahe hain — 5,000 / 10,000 / 20,000?"
        if product:
            return f"{product['name']} ke liye aapka city batao — wahan ke references share karta hoon."
        return "Aapko kya chahiye — bag, pouch, sticker, visiting card, bill book, letterpad, keychain, ya pen? Bata dijiye, main rate aur photo share karta hoon."

    def _build_known_context(self, lead: dict, flags: dict, language_hint: str, profile: dict = None) -> str:
        known = {
            "name":            lead.get("name") or (profile or {}).get("name"),
            "product":         lead.get("product"),
            "quantity":        lead.get("quantity"),
            "city":            lead.get("city") or lead.get("pincode") or (profile or {}).get("city"),
            "current_pouches": lead.get("current_pouches"),
            "printed_status":  lead.get("printed_status"),
            "services":        lead.get("services"),
            "email":           lead.get("email"),
        }
        known_text = ", ".join(f"{k}={v}" for k, v in known.items() if v)
        asked = ", ".join(flags.get("asked_questions") or [])
        last_q = flags.get("last_question_key") or ""
        profile_note = ""
        if profile and (profile.get("city") or profile.get("name")):
            profile_note = (
                f" RETURNING CUSTOMER PROFILE: {', '.join(f'{k}={v}' for k, v in profile.items() if v)}."
                " Do NOT ask for name or city again — you already know them."
            )
        return (
            "\n\n[SYSTEM MEMORY: "
            f"Known: {known_text or 'none'}. "
            f"Already asked: {asked or 'none'}. Last question: {last_q or 'none'}. "
            "Never repeat an already-answered question. Ask only the next unanswered one. "
            f"Language hint: {language_hint}. Reply in same language/script.{profile_note}]"
        )

    def _is_all_products_request(self, text: str) -> bool:
        return any(t in text.lower() for t in ALL_PRODUCTS_TRIGGERS)

    async def _send_product_carousel(self, phone: str):
        carousel_products = [
            ("Medicine Pouch – Small",  "pouch_small",           "5,000 pcs – ₹4,999/-"),
            ("Medicine Pouch – Medium", "pouch_medium",          "5,000 pcs – ₹5,499/-"),
            ("Medicine Pouch – Large",  "pouch_large",           "5,000 pcs – ₹6,999/-"),
            ("Visiting Cards 350 GSM",  "visiting_card_350gsm",  "2,000 cards – ₹999/-"),
            ("Prescription Stickers",   "prescription_stickers", "5,000 pcs – ₹1,699/-"),
        ]
        cards = []
        for display_name, key, price_hint in carousel_products:
            p = PRODUCTS.get(key)
            if not p:
                continue
            img = p.get("photo_url") or p.get("media_url", "")
            if not img or p.get("media_type") == "video":
                continue
            cards.append({"image_url": img, "title": display_name, "body": price_hint, "buttons": ["Get Rates", "Place Order 🛒"]})
        if cards:
            await self.client.send_carousel(phone, cards)
        else:
            await self.client.send_text(phone, "Rareprint products: Medicine Pouches, Visiting Cards, Stickers, Bill Books, Letterpads, Carry Bags, Keychains, Pens\n\nWebsite: www.rareprint.in")

    async def _send_city_references(self, phone: str, city: str):
        customers = get_customers_by_city(city)
        photos = get_city_photos(city, max_photos=2)
        if not customers and not photos:
            return
        await asyncio.sleep(2)
        # Send customer photos first if available
        if photos:
            for photo_url in photos:
                await self.client.send_image(
                    phone, photo_url,
                    f"📸 {city.title()} ke Rareprint customer ki printed pouch"
                )
                await asyncio.sleep(0.5)
        # Then send customer names
        if customers:
            shown = customers[:5]
            names_text = "\n".join(f"• {n}" for n in shown)
            more = len(customers) - len(shown)
            more_text = f"\n_{more} aur customers hain {city} mein._" if more > 0 else ""
            msg = (
                f"✅ *Rareprint ke {city.title()} ke customers:*\n\n"
                f"{names_text}{more_text}\n\n"
                f"Ye sab already Rareprint se print karwa chuke hain. "
                f"Aap bhi inke jaise apni shop promote kar sakte hain! 😊"
            )
            await self.client.send_text(phone, msg)

    def _extract_qty_from_text(self, text: str) -> int | None:
        t = text.lower().replace(",", "")
        lakh = re.search(r"(\d+\.?\d*)\s*(lakh|lac)", t)
        if lakh:
            return int(float(lakh.group(1)) * 100000)
        k = re.search(r"(\d+)\s*k\b", t)
        if k:
            return int(k.group(1)) * 1000
        qty = re.search(r"(\d{3,})\s*(pcs?|pieces?|nos?\.?|qty|pouches?|stickers?|cards?)?", t)
        if qty:
            return int(qty.group(1))
        return None

    def _detect_language_hint(self, text: str) -> str:
        if not text.strip():
            return "same as customer"
        ranges = [
            ("Devanagari Hindi/Marathi", "ऀ", "ॿ"),
            ("Bengali", "ঀ", "৿"),
            ("Gujarati", "઀", "૿"),
            ("Tamil", "஀", "௿"),
            ("Telugu", "ఀ", "౿"),
            ("Malayalam", "ഀ", "ൿ"),
            ("Arabic/Urdu", "؀", "ۿ"),
        ]
        hits = []
        for name, start, end in ranges:
            count = sum(1 for c in text if start <= c <= end)
            if count:
                hits.append((name, count))
        latin = sum(1 for c in text if c.isalpha() and ord(c) < 128)
        if latin:
            hits.append(("Latin English/Hinglish/transliteration", latin))
        if not hits:
            return "same as customer"
        hits.sort(key=lambda x: x[1], reverse=True)
        if len(hits) >= 2 and hits[1][1] >= max(2, hits[0][1] * 0.25):
            return f"mixed {hits[0][0]} + {hits[1][0]}"
        return hits[0][0]

    def _describe_image(self, image_url: str) -> str:
        """Read a customer-sent image using Gemini Vision and extract order/sales details."""
        if not self.ai:
            return ""
        try:
            import httpx
            resp = httpx.get(image_url, timeout=12)
            resp.raise_for_status()
            media_type = resp.headers.get("content-type", "").split(";")[0].strip()
            if not media_type.startswith("image/"):
                media_type = mimetypes.guess_type(image_url)[0] or "image/jpeg"
            vision_model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(max_output_tokens=300),
                safety_settings=_SAFETY_SETTINGS,
            )
            response = vision_model.generate_content([
                {"mime_type": media_type, "data": resp.content},
                (
                    "Extract useful sales/order details from this image for a printing shop. "
                    "Mention visible product type, text, size, quantity, colors, contact details, or design notes. "
                    "If it looks like a payment screenshot, say 'Payment screenshot received'. "
                    "Keep it concise."
                ),
            ])
            return response.text.strip()
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
                self.store.update_customer_profile(phone, city=value)
                asyncio.create_task(self._send_city_references(phone, value))
        elif last_q == "current_pouches":
            self.store.update_lead(phone, current_pouches=value)
        elif last_q == "printed_status":
            lowered = value.lower()
            if any(w in lowered for w in ["plain", "normal", "simple", "without", "no print", "not printed"]):
                self.store.update_lead(phone, printed_status="plain/unprinted")
            elif any(w in lowered for w in ["printed", "print", "color", "colour"]):
                self.store.update_lead(phone, printed_status="printed")
            else:
                self.store.update_lead(phone, printed_status=value)
        elif last_q == "services":
            self.store.update_lead(phone, services=value)

    def _remember_question_from_reply(self, phone: str, reply: str):
        text = reply.lower()
        if "city" in text or "kahan" in text or "shehar" in text:
            self.store.mark_question_asked(phone, "city")
        elif "currently" in text and ("pouch" in text or "using" in text):
            self.store.mark_question_asked(phone, "current_pouches")
        elif "printed" in text or "plain" in text:
            self.store.mark_question_asked(phone, "printed_status")
        elif any(w in text for w in ["home delivery", "discount", "doctor", "services"]):
            self.store.mark_question_asked(phone, "services")
        elif any(w in text for w in ["quantity", "qty", "kitni", "kitna"]):
            self.store.mark_question_asked(phone, "quantity")

    def _extract_lead_data(self, phone: str, text: str):
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", text)
        if email_match:
            self.store.update_lead(phone, email=email_match.group())
        qty_match = re.search(r"(\d+)\s*(pcs?|pieces?|copies|qty|nos?\.?)", text, re.I)
        if qty_match:
            self.store.update_lead(phone, quantity=qty_match.group())
        pin_match = re.search(r"\b([1-9][0-9]{5})\b", text)
        if pin_match:
            self.store.update_lead(phone, pincode=pin_match.group())

        # After product rates sent → order / question / other
        if template_just_sent and product:
            return ["Place Order 🛒", "Ask a Question", "See Other Products"]

        # First 2 messages with no product detected → show product menu
        if history_len <= 2 and not product:
            return ["Medicine Pouches", "Visiting Cards", "Stickers & Labels"]

        # Customer has product but hasn't given quantity yet
        if product and not lead.get("quantity"):
            if "quantity" in ai_reply.lower() or "kitni" in ai_reply.lower() or "qty" in ai_reply.lower():
                return ["5,000 pcs", "10,000 pcs", "20,000 pcs"]

        # Payment stage
        if state == "product_sent" and lead.get("city") and lead.get("quantity"):
            return ["Place Order 🛒", "Need More Info", "Call Me"]

        return []

    async def _get_ai_reply(
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
        profile = self.store.get_customer_profile(phone)

        # Build context note for AI
        context_note = self._build_known_context(lead, flags, language_hint, profile)

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

        # Build Gemini chat history (alternating user/model)
        gemini_history = []
        for m in history[:-1]:   # exclude the just-added current message
            role = "user" if m["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [m["content"]]})

        try:
            system = CUSTOM_SYSTEM_PROMPT if CUSTOM_SYSTEM_PROMPT else build_system_prompt()
            model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=8192,
                    temperature=0.7,
                ),
                safety_settings=_SAFETY_SETTINGS,
                system_instruction=system,
            )
            chat = model.start_chat(history=gemini_history)
            async with _GEMINI_SEMAPHORE:
                response = await chat.send_message_async(text + context_note)
            reply = response.text.strip()
            logger.info(f"🤖 AI reply to {phone}: {reply[:80]}")
            return reply
        except Exception as e:
            logger.error(f"Gemini API error FULL: {type(e).__name__}: {e}")
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
            return "Order confirm karne ke liye payment details bhej raha hoon. [SEND_PAYMENT_LINK]"
        if any(word in lowered for word in ["high", "mahanga", "mehnga", "zyada", "expensive", "rate issue"]):
            return (
                "Sir/Madam, medicine pouch mein hum 70 GSM white paper aur multicolor printing use karte hain, raddi/single color nahi. "
                "10,000 qty par better rate hota hai aur 10,000 prescription stickers bhi saath milte hain."
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

    def _build_known_context(self, lead: dict, flags: dict, language_hint: str, profile: dict = None) -> str:
        known = {
            "name":           lead.get("name") or (profile or {}).get("name"),
            "product":        lead.get("product"),
            "quantity":       lead.get("quantity"),
            "city":           lead.get("city") or lead.get("pincode") or (profile or {}).get("city"),
            "current_pouches": lead.get("current_pouches"),
            "printed_status": lead.get("printed_status"),
            "services":       lead.get("services"),
            "email":          lead.get("email"),
        }
        known_text = ", ".join(f"{k}={v}" for k, v in known.items() if v)
        asked = ", ".join(flags.get("asked_questions") or [])
        last_q = flags.get("last_question_key") or ""
        profile_note = ""
        if profile and (profile.get("city") or profile.get("name")):
            profile_note = (
                f" RETURNING CUSTOMER PROFILE: {', '.join(f'{k}={v}' for k, v in profile.items() if v)}."
                " Do NOT ask for name or city again — you already know them."
            )
        return (
            "\n\n[SYSTEM MEMORY: "
            f"Known details: {known_text or 'none yet'}. "
            f"Already asked: {asked or 'none'}. Last question: {last_q or 'none'}. "
            "If the customer's latest message answers the last question, do not ask it again. "
            "Ask only the next unanswered question. Never repeat quantity, city, current pouch, printed/plain, or services questions once known. "
            f"Language/script hint: {language_hint}. Reply in this same language/script unless the customer changes language."
            f"{profile_note}]"
        )

    async def _send_product_carousel(self, phone: str):
        """Send a carousel of top products with images and Get Rates button."""
        # Pick products that have a photo_url or media_url (images only for carousel)
        carousel_products = [
            ("Medicine Pouch – Small", "pouch_small",    "5,000 pcs – ₹4,999/-"),
            ("Medicine Pouch – Medium","pouch_medium",   "5,000 pcs – ₹5,499/-"),
            ("Medicine Pouch – Large", "pouch_large",    "5,000 pcs – ₹6,999/-"),
            ("Visiting Cards 350 GSM", "visiting_card_350gsm", "2,000 cards – ₹999/-"),
            ("Prescription Stickers",  "prescription_sticker", "5,000 pcs – ₹1,699/-"),
        ]
        cards = []
        for display_name, key, price_hint in carousel_products:
            p = PRODUCTS.get(key)
            if not p:
                continue
            img = p.get("photo_url") or p.get("media_url", "")
            if not img or p.get("media_type") == "video":
                continue
            cards.append({
                "image_url": img,
                "title":     display_name,
                "body":      price_hint,
                "buttons":   ["Get Rates", "Place Order 🛒"],
            })

        if cards:
            self.client.send_carousel(phone, cards)
        else:
            # Fallback to text list if no images available
            await self.client.send_text(
                phone,
                "Rareprint products:\n• Medicine Pouches\n• Visiting Cards\n• Stickers\n• Bill Books\n• Letterpads\n• Carry Bags\n• Keychains\n\nWebsite: www.rareprint.in"
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
            image_data = resp.content

            vision_model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(max_output_tokens=250),
                safety_settings=_SAFETY_SETTINGS,
            )
            response = vision_model.generate_content([
                {
                    "mime_type": media_type,
                    "data": image_data,
                },
                (
                    "Extract useful sales/order details from this customer image for a printing shop. "
                    "Mention visible product type, text, size, quantity, colors, contact details, or design notes. "
                    "If unclear, say what is unclear. Keep it concise."
                ),
            ])
            return response.text.strip()
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
                self.store.update_customer_profile(phone, city=value)
                # Send nearby customer references
                asyncio.create_task(self._send_city_references(phone, value))
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

    async def _send_city_references(self, phone: str, city: str):
        """Send nearby customer names as social proof after city is shared."""
        customers = get_customers_by_city(city)
        if not customers:
            return
        # Show max 5 names to keep it concise
        shown = customers[:5]
        names_text = "\n".join(f"• {n}" for n in shown)
        more = len(customers) - len(shown)
        more_text = f"\n_...aur {more} aur customers hain {city} mein._" if more > 0 else ""
        msg = (
            f"✅ *Rareprint ke {city} ke customers:*\n\n"
            f"{names_text}{more_text}\n\n"
            f"Ye sab already Rareprint se print karwa chuke hain. "
            f"Aap bhi inke jaise apni shop promote kar sakte hain! 😊"
        )
        await asyncio.sleep(2)  # slight delay so it comes after main reply
        await self.client.send_text(phone, msg)

    def _extract_qty_from_text(self, text: str) -> int | None:
        """Extract a numeric quantity from customer message."""
        import re
        # Match patterns like "5000", "5,000", "10k", "1 lakh", "1 lac"
        text = text.lower().replace(",", "")
        lakh = re.search(r"(\d+\.?\d*)\s*(lakh|lac|lakh)", text)
        if lakh:
            return int(float(lakh.group(1)) * 100000)
        k = re.search(r"(\d+)\s*k\b", text)
        if k:
            return int(k.group(1)) * 1000
        # Plain number followed by qty words
        qty = re.search(r"(\d{3,})\s*(pcs?|pieces?|nos?\.?|qty|quantity|pouches?|stickers?|cards?)?", text)
        if qty:
            return int(qty.group(1))
        return None

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

        if template_just_sent and product:
            return ["Place Order 🛒", "Ask a Question", "See Other Products"]
        if history_len <= 2 and not product:
            return ["Medicine Pouches", "Visiting Cards", "Stickers & Labels"]
        if product and not lead.get("quantity"):
            if any(w in ai_reply.lower() for w in ["quantity", "kitni", "qty", "5,000", "10,000"]):
                return ["5,000 pcs", "10,000 pcs", "20,000 pcs"]
        if state == "product_sent" and lead.get("city") and lead.get("quantity"):
            return ["Place Order 🛒", "Need More Info", "Call Me"]
        return []

    async def _get_ai_reply(self, phone, name, text, product, template_just_sent, ad_headline="", language_hint="same as customer"):
        if not self.ai:
            return f"Hi {name}! Thank you for your message. Please contact us at {BUSINESS_PHONE} for more details."
        history = self.store.get_history(phone)
        lead = self.store.get_lead(phone)
        flags = self.store.get_conversation_flags(phone)
        profile = self.store.get_customer_profile(phone)

        # If current text didn't contain a product keyword, look up the saved product from lead
        # This ensures fallback has product context for messages like "Noida", "10,000" etc.
        effective_product = product
        if not effective_product and lead.get("product"):
            effective_product = next(
                (p for p in PRODUCTS.values() if p["name"] == lead.get("product")), None
            )

        context_note = self._build_known_context(lead, flags, language_hint, profile)
        if ad_headline and not template_just_sent:
            context_note += f"\n\n[SYSTEM NOTE: Customer clicked ad: '{ad_headline}'. Greet and ask about their requirement. 1-2 lines max.]"
        elif template_just_sent and effective_product:
            context_note += f"\n\n[SYSTEM NOTE: Rates for '{effective_product['name']}' just sent. Don't repeat prices. Ask next SPIN question.]"
        elif effective_product:
            context_note += f"\n\n[SYSTEM NOTE: Customer is asking about '{effective_product['name']}'. Rates already sent. Help them move toward ordering.]"
        gemini_history = []
        for m in history[:-1]:
            role = "user" if m["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [m["content"]]})
        try:
            system = CUSTOM_SYSTEM_PROMPT if CUSTOM_SYSTEM_PROMPT else build_system_prompt()
            model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(max_output_tokens=8192, temperature=0.7),
                safety_settings=_SAFETY_SETTINGS,
                system_instruction=system,
            )
            chat = model.start_chat(history=gemini_history)
            async with _GEMINI_SEMAPHORE:
                response = await chat.send_message_async(text + context_note)
            reply = response.text.strip()
            logger.info(f"🤖 AI reply to {phone}: {reply[:80]}")
            return reply
        except Exception as e:
            logger.error(f"Gemini API error FULL: {type(e).__name__}: {e}")
            return self._fallback_reply(name, text, effective_product, template_just_sent)

    def _fallback_reply(self, name, text, product, template_just_sent):
        lowered = text.lower()
        if any(w in lowered for w in ["stop", "unsubscribe"]): return "[UNSUBSCRIBE]"
        if any(w in lowered for w in ["pay", "payment", "upi"]): return "Order confirm karne ke liye payment details bhej raha hoon. [SEND_PAYMENT_LINK]"
        if any(w in lowered for w in ["high", "mahanga", "expensive", "rate", "jada", "zyada", "km kro", "kam karo"]):
            prod_name = product['name'] if product else "product"
            return f"{prod_name} ke rates fixed hain — quality aur service ke liye best value. Kitni quantity chahiye?"
        if any(w in lowered for w in ["trust", "gst", "fake"]): return "GST: 27GEKPP2259Q1ZI — portal par verify karein. Amazon, IndiaMART par bhi listed hain."
        if template_just_sent and product: return f"{product['name']} ke rates share kar diye. Kitni quantity — 5,000 / 10,000 / 20,000?"
        if product:
            lead_qty = None  # quantity may already be known; keep reply contextual
            return f"{product['name']} ke baare mein baat kar rahe hain. Koi sawaal hai ya order confirm karna hai?"
        return "Kaunsa product chahiye? Pouch, sticker, visiting card, bill book, keychain ya kuch aur? Bata dijiye."

    def _build_known_context(self, lead, flags, language_hint, profile=None):
        known = {
            "name": lead.get("name") or (profile or {}).get("name"),
            "product": lead.get("product"),
            "quantity": lead.get("quantity"),
            "city": lead.get("city") or lead.get("pincode") or (profile or {}).get("city"),
            "current_pouches": lead.get("current_pouches"),
            "printed_status": lead.get("printed_status"),
            "services": lead.get("services"),
            "email": lead.get("email"),
        }
        known_text = ", ".join(f"{k}={v}" for k, v in known.items() if v)
        asked = ", ".join(flags.get("asked_questions") or [])
        last_q = flags.get("last_question_key") or ""
        profile_note = ""
        if profile and (profile.get("city") or profile.get("name")):
            profile_note = f" RETURNING CUSTOMER: {', '.join(f'{k}={v}' for k,v in profile.items() if v)}. Do NOT ask name/city again."
        return (f"\n\n[SYSTEM MEMORY: Known: {known_text or 'none'}. Asked: {asked or 'none'}. Last Q: {last_q or 'none'}. "
                f"Never repeat answered questions. Language: {language_hint}. Reply in same language.{profile_note}]")

    def _is_all_products_request(self, text):
        return any(t in text.lower() for t in ALL_PRODUCTS_TRIGGERS)

    async def _send_product_carousel(self, phone):
        carousel_products = [
            ("Medicine Pouch – Small", "pouch_small", "5,000 pcs – ₹4,999/-"),
            ("Medicine Pouch – Medium", "pouch_medium", "5,000 pcs – ₹5,499/-"),
            ("Medicine Pouch – Large", "pouch_large", "5,000 pcs – ₹6,999/-"),
            ("Visiting Cards 350 GSM", "visiting_card_350gsm", "2,000 cards – ₹999/-"),
            ("Prescription Stickers", "prescription_stickers", "5,000 pcs – ₹1,699/-"),
        ]
        cards = []
        for display_name, key, price_hint in carousel_products:
            p = PRODUCTS.get(key)
            if not p: continue
            img = p.get("photo_url") or p.get("media_url", "")
            if not img or p.get("media_type") == "video": continue
            cards.append({"image_url": img, "title": display_name, "body": price_hint, "buttons": ["Get Rates", "Place Order 🛒"]})
        if cards:
            await self.client.send_carousel(phone, cards)
        else:
            await self.client.send_text(phone, "Rareprint products: Medicine Pouches, Visiting Cards, Stickers, Bill Books, Letterpads, Bags, Keychains, Pens\n\nwww.rareprint.in")

    async def _send_city_references(self, phone, city):
        customers = get_customers_by_city(city)
        if not customers: return
        shown = customers[:5]
        names_text = "\n".join(f"• {n}" for n in shown)
        more = len(customers) - len(shown)
        more_text = f"\n_{more} aur customers hain {city} mein._" if more > 0 else ""
        msg = (f"✅ *Rareprint ke {city} ke customers:*\n\n{names_text}{more_text}\n\n"
               f"Ye sab already Rareprint se print karwa chuke hain. Aap bhi inke jaise apni shop promote kar sakte hain! 😊")
        await asyncio.sleep(2)
        await self.client.send_text(phone, msg)

    def _extract_qty_from_text(self, text):
        t = text.lower().replace(",", "")
        lakh = re.search(r"(\d+\.?\d*)\s*(lakh|lac)", t)
        if lakh: return int(float(lakh.group(1)) * 100000)
        k = re.search(r"(\d+)\s*k\b", t)
        if k: return int(k.group(1)) * 1000
        qty = re.search(r"(\d{3,})\s*(pcs?|pieces?|nos?\.?|qty|pouches?|stickers?|cards?)?", t)
        if qty: return int(qty.group(1))
        return None

    def _detect_language_hint(self, text):
        if not text.strip(): return "same as customer"
        ranges = [
            ("Devanagari Hindi/Marathi", "ऀ", "ॿ"),
            ("Bengali", "ঀ", "৿"),
            ("Gujarati", "઀", "૿"),
            ("Tamil", "஀", "௿"),
            ("Telugu", "ఀ", "౿"),
            ("Malayalam", "ഀ", "ൿ"),
            ("Arabic/Urdu", "؀", "ۿ"),
        ]
        hits = []
        for name, start, end in ranges:
            count = sum(1 for c in text if start <= c <= end)
            if count: hits.append((name, count))
        latin = sum(1 for c in text if c.isalpha() and ord(c) < 128)
        if latin: hits.append(("Latin English/Hinglish/transliteration", latin))
        if not hits: return "same as customer"
        hits.sort(key=lambda x: x[1], reverse=True)
        if len(hits) >= 2 and hits[1][1] >= max(2, hits[0][1] * 0.25):
            return f"mixed {hits[0][0]} + {hits[1][0]}"
        return hits[0][0]

    def _describe_image(self, image_url):
        if not self.ai: return ""
        try:
            import httpx
            resp = httpx.get(image_url, timeout=12)
            resp.raise_for_status()
            media_type = resp.headers.get("content-type", "").split(";")[0].strip()
            if not media_type.startswith("image/"):
                media_type = mimetypes.guess_type(image_url)[0] or "image/jpeg"
            vision_model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(max_output_tokens=300),
                safety_settings=_SAFETY_SETTINGS,
            )
            response = vision_model.generate_content([
                {"mime_type": media_type, "data": resp.content},
                ("Extract useful sales/order details from this image for a printing shop. "
                 "Mention product type, text, size, quantity, colors, contact details, or design notes. "
                 "If it looks like a payment screenshot, say 'Payment screenshot received'. Keep it concise."),
            ])
            return response.text.strip()
        except Exception as e:
            logger.warning(f"Image reading failed: {e}")
            return ""

    def _capture_answer_to_last_question(self, phone, text):
        flags = self.store.get_conversation_flags(phone)
        last_q = flags.get("last_question_key")
        value = text.strip()
        if not last_q or not value: return
        if last_q == "city" and not self.store.get_lead(phone).get("city"):
            if not re.search(r"\d", value) and len(value.split()) <= 4:
                self.store.update_lead(pho