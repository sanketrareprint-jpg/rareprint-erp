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

MEMORY RULES — ABSOLUTE:
- At the end of every message you receive, there is a [SYSTEM MEMORY] block listing ALREADY CAPTURED data.
- NEVER ask for any field listed in ALREADY CAPTURED. Not even to "confirm" it. Not even once.
- If customer already gave their city → do NOT ask city again. Use it directly.
- If customer already gave quantity → do NOT ask quantity again. Move to next step.
- If customer already gave name → address them by that name, do NOT ask again.
- Read ALREADY CAPTURED before every reply and skip those fields completely.

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
            image_note = await self._describe_image(msg["media_url"])
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

        # ── Payment confirmation — image OR Paytm/UPI auto-text ──────────────
        media_type = msg.get("media_type", "").lower()
        PAYMENT_TEXT_SIGNALS = [
            "money sent", "payment done", "payment sent", "transfer done",
            "payment successful", "transaction successful", "sent successfully",
            "upi ref", "utr no", "transaction id", "txn id", "ref no",
            "amount deducted", "debited",
        ]
        text_lower_pay = text.lower()
        is_payment_text = any(sig in text_lower_pay for sig in PAYMENT_TEXT_SIGNALS)
        is_payment_image = media_type in ["image", "photo"]

        if is_payment_text or (state == "payment_sent" and is_payment_image):
            lead = self.store.get_lead(phone)
            p_name = lead.get("product", "")
            self.store.set_state(phone, "payment_sent")
            if is_payment_image:
                await self.client.send_text(phone, "✅ Payment screenshot mil gaya! Bahut shukriya.")
            else:
                await self.client.send_text(phone, "✅ Payment confirm ho gaya! Bahut shukriya.")
            matter_prompt = get_design_matter_prompt(p_name, phone=phone, app_url=APP_URL)
            await self.client.send_text(phone, matter_prompt)
            self.store.add_message(phone, "assistant", matter_prompt)
            self.store.set_state(phone, "collecting_design")
            return

        if state == "unsubscribed":
            return  # silently ignore

        if self._is_all_products_request(text) and not self.store.get_lead(phone).get("product"):
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
        # Normalize common typing variants before any matching
        text_lower = text.lower().replace("*", "x").replace("×", "x")

        product = get_product_by_keyword(text_lower)
        template_sent = False

        # ── Generic pouch keyword → ask size first ────────────────────────────
        GENERIC_POUCH_WORDS = [
            "pouch", "pouches", "medicine pouch", "lifafa", "lifafe",
            "pauch", "pauche", "dawai", "dawa ki potli", "medicine bag",
            "medecine pouch", "medicin pouch", "medisine pouch",
        ]
        SIZE_WORDS = [
            "small", "medium", "large", "extra large", "xl", "chota", "bada",
            "4x5", "4x7", "5.5x8", "8.5x11",
        ]

        # ── Size-after-question handler ───────────────────────────────────────
        # When bot already asked "Konsa size?", map any size-related reply to the product
        flags = self.store.get_conversation_flags(phone)
        last_q = flags.get("last_question_key", "")
        SIZE_MAP = {
            "small":       ("small", "Medicine Pouch – Small Size"),
            "4x5":         ("small", "Medicine Pouch – Small Size"),
            "chota":       ("small", "Medicine Pouch – Small Size"),
            "chhota":      ("small", "Medicine Pouch – Small Size"),
            "medium":      ("medium", "Medicine Pouch – Medium Size"),
            "4x7":         ("medium", "Medicine Pouch – Medium Size"),
            "large":       ("large", "Medicine Pouch – Large Size"),
            "5.5x8":       ("large", "Medicine Pouch – Large Size"),
            "bada":        ("large", "Medicine Pouch – Large Size"),
            "extra large": ("xl",    "Medicine Pouch – Extra Large Size"),
            "xl":          ("xl",    "Medicine Pouch – Extra Large Size"),
            "8.5x11":      ("xl",    "Medicine Pouch – Extra Large Size"),
        }
        VAGUE_CONFIRMATIONS = [
            "ye size", "yahi", "ye wala", "yeh wala", "isi ka", "iska",
            "this one", "this", "same", "usi", "wahi", "woh wala",
            "ye hi", "yahi chahiye", "ye chahiye", "ye saiz", "yeh saiz",
        ]

        if last_q == "size" and not self.store.get_lead(phone).get("product"):
            # Check if customer typed a recognizable size
            matched_product_name = None
            for size_key, (_, prod_name) in SIZE_MAP.items():
                if size_key in text_lower:
                    matched_product_name = prod_name
                    break

            if matched_product_name:
                # Treat as size selection → find product and send template
                size_product = next(
                    (p for p in PRODUCTS.values() if p["name"] == matched_product_name), None
                )
                if size_product:
                    await self.client.send_product_template(phone, size_product)
                    self.store.update_lead(phone, product=size_product["name"])
                    self.store.set_state(phone, "product_sent")
                    template_sent = True
                    product = size_product
            elif any(v in text_lower for v in VAGUE_CONFIRMATIONS):
                # Vague answer — re-show size buttons
                await self.client.send_buttons(
                    phone,
                    "Konsa size select karna hai? Please ek choose karein:",
                    ["Small (4×5 inch)", "Medium (4×7 inch)", "Large (5.5×8 inch)"]
                )
                await self.client.send_text(phone, "Ya Extra Large (8.5×11 inch) type karein.")
                self.store.add_message(phone, "assistant", "Konsa size select karna hai?")
                return

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
            self.store.mark_question_asked(phone, "size")  # track that size was asked
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
                        self.store.clear_last_question(phone)  # qty answered — don't re-ask
                        return

        # ── state == "payment_sent": wait for actual payment proof
        # (design matter is triggered in the payment-image/text block above)

        # ── Order confirmation words → send payment link ─────────────────────────
        CONFIRM_WORDS = {
            "yes, confirm ✅", "yes confirm", "confirm ✅", "haan confirm", "yes",
            "haan", "ha", "bilkul", "kar do", "karo", "theek hai", "thik hai",
            "chalega", "chale ga", "done", "ok confirm", "confirm karo",
            "order confirm", "haan ji", "ji haan", "zaroor", "perfect",
            "proceed", "aage badho", "book karo", "slot book karo",
        }
        if text.strip().lower() in CONFIRM_WORDS:
            lead = self.store.get_lead(phone)
            p_name = lead.get("product")
            qty = lead.get("quantity")
            if p_name and qty:
                p_obj = next((p for p in PRODUCTS.values() if p["name"] == p_name), None)
                if p_obj:
                    confirm_text = (
                        f"✅ Perfect! *{p_name}* — *{qty} pcs* order confirm ho raha hai.\n\n"
                        f"₹500 token amount bhejein slot book karne ke liye:"
                    )
                    await self.client.send_text(phone, confirm_text)
                    await self.client.send_payment_link(phone, p_obj)
                    self.store.add_message(phone, "assistant", confirm_text)
                    self.store.set_state(phone, "payment_sent")
                    return

        # ── "Place Order 🛒" button — handle directly before AI ─────────────────
        if text.strip().lower() in ["place order 🛒", "place order", "order karna hai", "order karo"]:
            lead = self.store.get_lead(phone)
            existing_qty = lead.get("quantity")
            p_name = lead.get("product")
            p_obj = next((p for p in PRODUCTS.values() if p["name"] == p_name), None) if p_name else None
            if existing_qty and p_obj:
                # Qty already known — go straight to rate confirm
                safe_qty = self._extract_qty_from_text(existing_qty) or self._extract_qty_from_text(str(existing_qty).replace(",",""))
                rate_reply = get_rate_for_qty(p_obj, safe_qty) if (safe_qty and p_obj.get("price_list")) else None
                if rate_reply:
                    confirm_msg = (
                        f"{rate_reply}\n\n"
                        f"Order confirm karne ke liye sirf *₹500 token amount* bhejein.\n"
                        f"Yeh amount aapke final invoice mein adjust ho jayega. 😊\n\n"
                        f"Order confirm karna hai?"
                    )
                    await self.client.send_buttons(phone, confirm_msg, ["Yes, Confirm ✅", "Need More Info"])
                    self.store.add_message(phone, "assistant", confirm_msg)
                    self.store.clear_last_question(phone)
                    return
            elif p_obj:
                # No qty yet — ask once with product-specific buttons
                p_name_lower = (p_name or "").lower()
                if "visiting card" in p_name_lower or "prescription sticker" in p_name_lower:
                    qty_btns = ["2,000 pcs", "5,000 pcs", "10,000 pcs"]
                elif "keychain" in p_name_lower or "pen " in p_name_lower:
                    qty_btns = ["500 pcs", "1,000 pcs", "2,000 pcs"]
                elif "bill book" in p_name_lower or "letterpad" in p_name_lower:
                    qty_btns = ["10 pads", "20 pads", "50 pads"]
                else:
                    qty_btns = ["5,000 pcs", "10,000 pcs", "20,000 pcs"]
                msg = f"{p_name} ke liye kitni quantity chahiye?"
                await self.client.send_buttons(phone, msg, qty_btns)
                self.store.add_message(phone, "assistant", msg)
                self.store.mark_question_asked(phone, "quantity")
                return

        # ── "Need More Info" / "Ask a Question" → invite specific question ────────
        if text.strip().lower() in ["need more info", "ask a question", "more info", "puchna hai"]:
            lead = self.store.get_lead(phone)
            prod = lead.get("product", "")
            reply_msg = f"{prod} ke baare mein kya jaanna chahte hain? Rate, quality, delivery time, ya kuch aur?" if prod else "Kya jaanna chahte hain? Rate, quality, delivery, ya kuch aur?"
            await self.client.send_text(phone, reply_msg)
            self.store.add_message(phone, "assistant", reply_msg)
            return

        # ── Phone call request — catch all variations ────────────────────────────
        CALL_TRIGGERS = [
            "call me", "call karo", "call karein", "call kijiye", "phone karo",
            "call kr", "call kar", "bat kriye", "baat kriye", "baat karo",
            "phone pe", "phone par", "phone kriye", "phone karo", "call kro",
            "call pe baat", "baat karni", "direct baat", "baat karte",
            "number do", "number dena", "apna number", "contact number",
            "phone number", "whatsapp number",
        ]
        if any(t in text.lower() for t in CALL_TRIGGERS):
            await self.client.send_text(phone, f"Zaroor! Hamare number par call ya WhatsApp karein:\n*{BUSINESS_PHONE}*\n\nSomvar se Shanivar, subah 10 baje se shaam 7 baje tak available hain. 😊")
            self.store.add_message(phone, "assistant", f"Call number: {BUSINESS_PHONE}")
            return

        # ── Video/ad question → answer which size shown ──────────────────────────
        VIDEO_TRIGGERS = [
            "video", "video mein", "video pe", "video par", "video me",
            "ad mein", "ad pe", "ad me", "photo mein", "photo pe",
            "image mein", "pic mein", "konsa size dikha", "kaunsa size",
            "ye wala", "is wale", "isme", "iss mein",
        ]
        if any(t in text.lower() for t in VIDEO_TRIGGERS) and not self.store.get_lead(phone).get("quantity"):
            lead = self.store.get_lead(phone)
            prod = lead.get("product", "Medicine Pouch")
            msg = (
                f"Video/ad mein sab sizes available hain — Small (4x5 inch), Medium (4x7 inch), "
                f"Large (5.5x8 inch), Extra Large (8.5x11 inch). "
                f"Aap already *{prod}* select kar chuke hain. Kitni quantity chahiye — 5,000 / 10,000 / 20,000?"
            ) if lead.get("product") else (
                "Ad mein sab sizes available hain — Small, Medium, Large, Extra Large. Konsa size chahiye aapko?"
            )
            await self.client.send_text(phone, msg)
            self.store.add_message(phone, "assistant", msg)
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
            # Send the accompanying text first, then the payment link
            if ai_reply:
                await self.client.send_text(phone, ai_reply)
                self.store.add_message(phone, "assistant", ai_reply)
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
            if any(w in ai_reply.lower() for w in ["quantity", "kitni", "qty", "5,000", "10,000", "2,000"]):
                # Product-specific quantity buttons
                prod_name_lower = (lead.get("product") or "").lower()
                if "visiting card" in prod_name_lower or "prescription sticker" in prod_name_lower:
                    return ["2,000 pcs", "5,000 pcs", "10,000 pcs"]
                elif "keychain" in prod_name_lower or "pen " in prod_name_lower:
                    return ["500 pcs", "1,000 pcs", "2,000 pcs"]
                elif "bill book" in prod_name_lower or "letterpad" in prod_name_lower:
                    return ["10 pads", "20 pads", "50 pads"]
                else:
                    return ["5,000 pcs", "10,000 pcs", "20,000 pcs"]
        if lead.get("quantity") and lead.get("product"):
            # If qty confirmed — nudge toward order
            if any(w in ai_reply.lower() for w in ["confirm", "₹500", "token", "order", "book"]):
                return ["Yes, Confirm ✅", "Need More Info", "Call Me"]
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

        # Use saved product from lead if current message didn't contain a product keyword
        effective_product = product
        if not effective_product and lead.get("product"):
            effective_product = next(
                (p for p in PRODUCTS.values() if p["name"] == lead.get("product")), None
            )

        context_note = self._build_known_context(lead, flags, language_hint, profile)

        if ad_headline and not template_just_sent:
            context_note += (
                f"\n\n[SYSTEM NOTE: Customer clicked Facebook/Instagram ad: '{ad_headline}'. "
                f"Greet them and directly ask about their requirement for that product. 1-2 lines max.]"
            )
        elif template_just_sent and effective_product:
            context_note += (
                f"\n\n[SYSTEM NOTE: Rates for '{effective_product['name']}' just sent. Don't repeat prices. "
                f"Ask quantity only if not already known; otherwise ask next unanswered SPIN question.]"
            )
        elif effective_product:
            context_note += (
                f"\n\n[SYSTEM NOTE: Customer is asking about '{effective_product['name']}'. "
                f"Rates already sent. Help them move toward ordering.]"
            )

        gemini_history = []
        first_user_seen = False
        for m in history[:-1]:
            role = "user" if m["role"] == "user" else "model"
            if role == "user":
                first_user_seen = True
            if not first_user_seen:
                continue  # skip leading model turns — Gemini requires user first
            gemini_history.append({"role": role, "parts": [m["content"]]})

        try:
            system = CUSTOM_SYSTEM_PROMPT if CUSTOM_SYSTEM_PROMPT else build_system_prompt()
            # Reuse self.ai with updated system instruction instead of creating a new model each call
            model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=512,
                    temperature=0.7,
                ),
                safety_settings=_SAFETY_SETTINGS,
                system_instruction=system,
            )
            chat = model.start_chat(history=gemini_history)
            async with _GEMINI_SEMAPHORE:
                response = await asyncio.wait_for(
                    chat.send_message_async(text + context_note),
                    timeout=20.0,
                )
            reply = response.text.strip()
            logger.info(f"🤖 AI reply to {phone}: {reply[:80]}")
            return reply
        except asyncio.TimeoutError:
            logger.error(f"Gemini timeout for {phone} — using fallback")
            lead = self.store.get_lead(phone)
            return self._fallback_reply(name, text, effective_product, template_just_sent, lead)
        except Exception as e:
            logger.error(f"Gemini API error FULL: {type(e).__name__}: {e}")
            lead = self.store.get_lead(phone)
            return self._fallback_reply(name, text, effective_product, template_just_sent, lead)

    def _fallback_reply(self, name: str, text: str, product: dict | None, template_just_sent: bool, lead: dict = None) -> str:
        lead = lead or {}
        lowered = text.lower()
        if any(w in lowered for w in ["stop", "unsubscribe", "opt out"]):
            return "[UNSUBSCRIBE]"
        if any(w in lowered for w in ["pay", "payment", "upi", "advance", "order confirm"]):
            return "Order confirm karne ke liye payment details bhej raha hoon. [SEND_PAYMENT_LINK]"
        if any(w in lowered for w in ["high", "mahanga", "mehnga", "expensive", "zyada", "km kro", "kam karo"]):
            prod_name = product["name"] if product else "hamare products"
            return f"{prod_name} ke rates fixed hain — quality aur service ke liye best value hai. Koi aur sawaal?"
        if any(w in lowered for w in ["trust", "gst", "fake"]):
            return "GST: 27GEKPP2259Q1ZI — portal par verify karein. Amazon, IndiaMART par bhi listed hain."
        # If qty already captured — don't ask again; instead move toward order confirmation
        known_qty = lead.get("quantity")
        prod_name = product["name"] if product else lead.get("product", "")
        if prod_name and known_qty:
            return (
                f"Aapka order detail: *{prod_name}* — *{known_qty} pcs*\n\n"
                f"Order confirm karne ke liye sirf *₹500 token amount* bhejein. "
                f"Yeh amount aapke final invoice mein adjust hoga. 😊"
            )
        if prod_name and not known_qty:
            prod_lower = prod_name.lower()
            if "visiting card" in prod_lower or "prescription sticker" in prod_lower:
                qty_hint = "2,000 / 5,000 / 10,000?"
            elif "keychain" in prod_lower or "pen " in prod_lower:
                qty_hint = "500 / 1,000 / 2,000?"
            elif "bill book" in prod_lower or "letterpad" in prod_lower:
                qty_hint = "10 / 20 / 50 pads?"
            else:
                qty_hint = "5,000 / 10,000 / 20,000?"
            return f"{prod_name} ke liye kitni quantity chahiye — {qty_hint}"
        return (
            f"Hi {name}! Rareprint mein aapka swagat hai. 😊\n\n"
            f"Hum print karte hain: Medicine Pouches, Visiting Cards, Prescription Stickers, "
            f"Bill Books, Carry Bags, Keychains, Pens aur zyada.\n\n"
            f"Kaunsa product chahiye? Ya seedha call karein: *{BUSINESS_PHONE}*"
        )

    def _build_known_context(self, lead: dict, flags: dict, language_hint: str, profile: dict = None) -> str:
        # Fields that are already captured — AI must NOT ask for these again
        known_raw = {
            "name":            lead.get("name") or (profile or {}).get("name"),
            "product":         lead.get("product"),
            "quantity":        lead.get("quantity"),
            "city":            lead.get("city") or lead.get("pincode") or (profile or {}).get("city"),
            "current_pouches": lead.get("current_pouches"),
            "printed_status":  lead.get("printed_status"),
            "services":        lead.get("services"),
            "email":           lead.get("email"),
        }
        captured = {k: v for k, v in known_raw.items() if v}
        missing  = [k for k, v in known_raw.items() if not v]

        captured_text = ", ".join(f"{k}={v}" for k, v in captured.items()) or "nothing yet"

        last_q = flags.get("last_question_key") or ""
        # Only show last_q if NOT already captured (i.e., still unanswered)
        pending_note = f"Waiting for answer to: {last_q}. " if last_q and last_q not in captured else ""

        # Determine next step to guide AI
        if captured.get("quantity") and captured.get("product"):
            next_step = "Quantity and product known — ask customer to confirm the order with ₹500 token. Only use [SEND_PAYMENT_LINK] AFTER customer explicitly says they want to confirm/book the order (not just any 'yes')."
        elif captured.get("product") and not captured.get("quantity"):
            next_step = "Product known, quantity unknown — ask for quantity next (one question only)."
        elif not captured.get("product"):
            next_step = "Ask what product they need."
        else:
            next_step = "Continue conversation toward ₹500 token close."

        profile_note = ""
        if profile and (profile.get("city") or profile.get("name")):
            profile_note = " RETURNING CUSTOMER — do NOT ask name or city again."

        return (
            "\n\n[SYSTEM MEMORY — STRICT RULES: "
            f"ALREADY CAPTURED (NEVER ASK FOR THESE AGAIN): {captured_text}. "
            f"{pending_note}"
            f"NEXT STEP: {next_step} "
            f"Language: {language_hint}. Reply in exact same language/script as customer.{profile_note}]"
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
        # Hindi word numbers
        HINDI_NUMBERS = {
            "ek hazaar": 1000, "do hazaar": 2000, "teen hazaar": 3000,
            "chaar hazaar": 4000, "paanch hazaar": 5000, "panch hazaar": 5000,
            "chhe hazaar": 6000, "saat hazaar": 7000, "aath hazaar": 8000,
            "nau hazaar": 9000, "das hazaar": 10000, "bees hazaar": 20000,
            "pachees hazaar": 25000, "tees hazaar": 30000, "pachas hazaar": 50000,
            "ek lakh": 100000, "do lakh": 200000,
        }
        for phrase, val in HINDI_NUMBERS.items():
            if phrase in t:
                return val
        # "5 thousand" or "5thousand"
        thousand = re.search(r"(\d+)\s*thousand", t)
        if thousand:
            return int(thousand.group(1)) * 1000
        k = re.search(r"(\d+)\s*k\b", t)
        if k:
            return int(k.group(1)) * 1000
        # Require unit suffix for bare numbers to avoid capturing prices (e.g. "₹4999")
        qty_with_unit = re.search(r"(\d{1,})\s*(pcs?|pieces?|nos?\.?|qty|pouches?|stickers?|cards?|pads?|books?|sets?)", t)
        if qty_with_unit:
            return int(qty_with_unit.group(1))
        # Bare 4-5 digit number only if no ₹/rs/rupee nearby (not a price)
        if not re.search(r"[₹]|\brs\b|\brupee", t):
            bare = re.search(r"\b(\d{4,6})\b", t)
            if bare:
                return int(bare.group(1))
        return None

    def _detect_language_hint(self, text: str) -> str:
        if not text.strip():
            return "same as customer"
        ranges = [
            ("Devanagari Hindi/Marathi", "ऀ", "ॿ"),
            ("Bengali", "ঀ", "৿"),
            ("Gurmukhi Punjabi", "਀", "੿"),
            ("Gujarati", "઀", "૿"),
            ("Odia", "଀", "୿"),
            ("Tamil", "஀", "௿"),
            ("Telugu", "ఀ", "౿"),
            ("Kannada", "ಀ", "೿"),
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

    async def _describe_image(self, image_url: str) -> str:
        """Read a customer-sent image using Gemini Vision and extract order/sales details."""
        if not self.ai:
            return ""
        try:
            import httpx
            resp = await asyncio.to_thread(httpx.get, image_url, timeout=12)
            resp.raise_for_status()
            media_type = resp.headers.get("content-type", "").split(";")[0].strip()
            if not media_type.startswith("image/"):
                media_type = mimetypes.guess_type(image_url)[0] or "image/jpeg"
            vision_model = genai.GenerativeModel(
                model_name="models/gemini-2.5-flash",
                generation_config=genai.types.GenerationConfig(max_output_tokens=300),
                safety_settings=_SAFETY_SETTINGS,
            )
            prompt_parts = [
                {"mime_type": media_type, "data": resp.content},
                (
                    "Extract useful sales/order details from this image for a printing shop. "
                    "Mention visible product type, text, size, quantity, colors, contact details, or design notes. "
                    "If it looks like a payment screenshot, say 'Payment screenshot received'. "
                    "Keep it concise."
                ),
            ]
            response = await asyncio.to_thread(vision_model.generate_content, prompt_parts)
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
        captured = False

        if last_q == "city" and not self.store.get_lead(phone).get("city"):
            # Accept city if no digits and reasonably short (avoid capturing "nahi" etc.)
            reject_words = {"nahi", "no", "na", "nope", "stop", "baad", "later", "thik", "ok", "okay", "haan", "yes", "bilkul", "theek", "zaroor", "kal", "aaj", "abhi", "soch", "dekhte", "samjha", "bata", "dekh", "jaata", "jata", "woh", "wo", "hmm", "ha", "ji", "hn", "accha", "acha", "theek", "kab", "karo", "karunga", "bataunga", "bolunga", "samjha", "dekhunga", "phir", "baad"}
            words_in_value = set(value.lower().split())
            if not re.search(r"\d", value) and len(value.split()) <= 4 and not value.lower() in reject_words and not words_in_value.intersection(reject_words):
                self.store.update_lead(phone, city=value)
                self.store.update_customer_profile(phone, city=value)
                asyncio.create_task(self._send_city_references(phone, value))
                captured = True

        elif last_q == "current_pouches":
            self.store.update_lead(phone, current_pouches=value)
            captured = True

        elif last_q == "printed_status":
            lowered = value.lower()
            if any(w in lowered for w in ["plain", "normal", "simple", "without", "no print", "not printed"]):
                self.store.update_lead(phone, printed_status="plain/unprinted")
            elif any(w in lowered for w in ["printed", "print", "color", "colour"]):
                self.store.update_lead(phone, printed_status="printed")
            else:
                self.store.update_lead(phone, printed_status=value)
            captured = True

        elif last_q == "services":
            self.store.update_lead(phone, services=value)
            captured = True

        elif last_q == "quantity":
            qty = self._extract_qty_from_text(value)
            if qty:
                self.store.update_lead(phone, quantity=str(qty))
                captured = True

        elif last_q == "name" and not self.store.get_lead(phone).get("name"):
            if len(value.split()) <= 5 and not re.search(r"\d", value):
                self.store.update_lead(phone, name=value)
                captured = True

        # Clear last_question_key so the AI doesn't re-ask this question
        if captured:
            self.store.clear_last_question(phone)

    def _remember_question_from_reply(self, phone: str, reply: str):
        """
        Detect which question the bot just asked and track it.
        Only marks questions NOT already answered in the lead.
        """
        text = reply.lower()
        lead = self.store.get_lead(phone)

        # Only track if the reply is actually asking something
        is_question = "?" in reply or any(w in text for w in [
            "batao", "bataiye", "kya hai", "kahan", "kitni", "kitna",
            "kaun", "kaunsa", "share karo", "share karein",
        ])
        if not is_question:
            return

        if not lead.get("city") and any(w in text for w in ["city", "kahan", "shehar", "location", "kaha"]):
            self.store.mark_question_asked(phone, "city")
        elif not lead.get("current_pouches") and "currently" in text and ("pouch" in text or "using" in text):
            self.store.mark_question_asked(phone, "current_pouches")
        elif not lead.get("printed_status") and ("printed" in text or "plain" in text) and "?" in reply:
            self.store.mark_question_asked(phone, "printed_status")
        elif not lead.get("services") and any(w in text for w in ["home delivery", "discount", "doctor", "services"]):
            self.store.mark_question_asked(phone, "services")
        elif not lead.get("quantity") and any(w in text for w in ["quantity", "qty", "kitni", "kitna", "kitne"]):
            self.store.mark_question_asked(phone, "quantity")
        elif not lead.get("name") and any(w in text for w in ["aapka naam", "your name", "naam kya", "naam batao"]):
            self.store.mark_question_asked(phone, "name")

    def _extract_lead_data(self, phone: str, text: str):
        lead = self.store.get_lead(phone)
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", text)
        if email_match and not lead.get("email"):
            self.store.update_lead(phone, email=email_match.group())
        # Only extract qty if not already captured; use comprehensive extractor
        if not lead.get("quantity"):
            qty = self._extract_qty_from_text(text)
            if qty:
                self.store.update_lead(phone, quantity=str(qty))
        pin_match = re.search(r"\b([1-9][0-9]{5})\b", text)
        if pin_match and not lead.get("pincode"):
            self.store.update_lead(phone, pincode=pin_match.group(1))
