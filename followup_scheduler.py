"""
Within-24-hour WhatsApp follow-up scheduler.

Uses normal chatbot replies only while WhatsApp's customer-service window is open.
After 24 hours, approved templates/campaigns must be used instead.
"""

import asyncio
import logging
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from aisensy_client import AiSensyClient
from conversation_store import ConversationStore

logger = logging.getLogger(__name__)

CUSTOMER_WINDOW_SECONDS = 24 * 60 * 60

# Every 3 hours: 3hr, 6hr, 9hr, 12hr, 15hr, 18hr, 21hr
DEFAULT_DELAYS = [3*3600, 6*3600, 9*3600, 12*3600, 15*3600, 18*3600, 21*3600]

# Allowed hours to send follow-ups (IST): 7am to 11:59pm
FOLLOWUP_START_HOUR = 7
FOLLOWUP_END_HOUR   = 24


class FollowUpScheduler:
    def __init__(self, store: ConversationStore, client: AiSensyClient, agent=None):
        self.store = store
        self.client = client
        self.agent = agent
        self.enabled = os.getenv("FOLLOWUP_ENABLED", "true").lower() not in ["0", "false", "off", "no"]
        self.poll_seconds = int(os.getenv("FOLLOWUP_POLL_SECONDS", "60"))
        self.delays = self._parse_delays(os.getenv("FOLLOWUP_DELAYS_SECONDS", ""))
        self._task: asyncio.Task | None = None
        self._in_progress: set[str] = set()  # prevent duplicate sends for same phone

    def start(self):
        if not self.enabled:
            logger.info("Within-24-hour follow-up scheduler disabled")
            return
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())
        logger.info("Within-24-hour follow-up scheduler started")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self):
        while True:
            try:
                await self._tick()
            except Exception as e:
                logger.error(f"Follow-up scheduler tick failed: {e}")
            await asyncio.sleep(self.poll_seconds)

    async def _tick(self):
        now = time.time()
        # Only send follow-ups between 7 AM and midnight IST
        ist_hour = datetime.now(ZoneInfo("Asia/Kolkata")).hour
        if not (FOLLOWUP_START_HOUR <= ist_hour < FOLLOWUP_END_HOUR):
            return

        for phone, session in self.store.iter_sessions():
            if not str(phone).isdigit():
                continue
            state = session.get("state", "greeting")
            if state in ["unsubscribed", "payment_sent", "closed", "order_confirmed"]:
                continue

            last_customer = float(session.get("last_customer_message_at") or 0)
            last_bot = float(session.get("last_bot_message_at") or 0)
            if not last_customer or not last_bot:
                continue
            if last_bot < last_customer:
                continue

            window_age = now - last_customer
            if window_age >= CUSTOMER_WINDOW_SECONDS:
                continue

            sent = session.get("followups_sent") or {}
            due_delays = [delay for delay in self.delays if window_age >= delay and str(delay) not in sent]
            if not due_delays:
                continue

            # Skip if already being processed (prevents race-condition duplicates)
            if phone in self._in_progress:
                continue
            self._in_progress.add(phone)

            try:
                delay = max(due_delays)
                price_objection   = self._has_price_objection(session)
                advance_objection = self._has_advance_objection(session)
                message = await self._localize_message(
                    self._message_for_delay(delay, session, price_objection, advance_objection), session
                )
                # Slot 5 (18hr) = quiz slot — send image first
                slot = delay // (3 * 3600)
                if slot == 5 and not price_objection and not advance_objection:
                    await self.client.send_image(
                        phone,
                        "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/2864041_WhatsApp Image 20260528 at 12.29.23 PM.jpeg",
                        "🎉 Doctor Logo Quiz — Win 500 FREE Medicine Pouches!"
                    )
                    await asyncio.sleep(1)
                ok = await self.client.send_text(phone, message)
                if ok:
                    for old_delay in self.delays:
                        if old_delay <= delay:
                            self.store.mark_followup_sent(phone, str(old_delay), last_customer)
                    self.store.add_message(phone, "assistant", message)
                    logger.info(f"Follow-up sent to {phone} after {delay} seconds")

                    # Send quiz promo only for slot 5 (quiz slot) — NOT after every follow-up
                    if slot == 5 and not price_objection and not advance_objection:
                        await asyncio.sleep(1)
                        quiz_msg = (
                            "🎉 *Bonus — FREE Pouches Contest!*\n\n"
                            "Rareprint ke Instagram par quiz chal raha hai — "
                            "sahi jawab dene wale *pehle 100 logon* ko "
                            "*500 medicine pouches BILKUL FREE* milenge!\n"
                            "Sirf courier charges lagenge.\n\n"
                            "Step 1️⃣ @rareprint.in follow karein\n"
                            "Step 2️⃣ Is post par comment karein 👇\n"
                            "https://www.instagram.com/p/DY9yNaAjPke/\n\n"
                            "Jaldi karein — sirf pehle 100 logon ke liye! ⏳"
                        )
                        await self.client.send_text(phone, quiz_msg)
            finally:
                self._in_progress.discard(phone)

    def _has_advance_objection(self, session: dict) -> bool:
        """Check if customer objected to advance payment."""
        history = session.get("history") or []
        advance_words = [
            "advance nahi", "pehle nahi", "delivery par", "cod chahiye", "full cod",
            "pehle paise nahi", "advance mat lo", "baad mein dunga", "delivery ke baad",
            "trust nahi", "pehle product", "pahle maal", "pehle dikhao"
        ]
        customer_msgs = [m["content"].lower() for m in history if m.get("role") == "user"][-10:]
        return any(word in msg for msg in customer_msgs for word in advance_words)

    def _has_price_objection(self, session: dict) -> bool:
        """Check if customer expressed a price objection in recent messages."""
        history = session.get("history") or []
        price_words = [
            "mehanga", "mahanga", "mehenga", "expensive", "costly", "zyada", "bahut zyada",
            "bahut mehanga", "itna zyada", "rate zyada", "price zyada", "rate high",
            "price high", "kam karo", "kam kro", "km kro", "discount", "sasta", "cheaper",
            "reduce", "jada he", "jyada he", "jada hai", "jyada hai", "rate jada",
            "rate km", "rate kum", "rate kam", "price km", "price kam", "thoda kam",
            "rate thoda", "bahut jada", "bahut jyada"
        ]
        # Check last 10 customer messages
        customer_msgs = [m["content"].lower() for m in history if m.get("role") == "user"][-10:]
        return any(word in msg for msg in customer_msgs for word in price_words)

    def _message_for_delay(self, delay: int, session: dict, price_objection: bool = False, advance_objection: bool = False) -> str:
        greeting = self._time_greeting()
        lead = session.get("lead") or {}
        asked = session.get("asked_questions") or []

        product   = lead.get("product", "")
        city      = lead.get("city") or lead.get("pincode", "")
        printed   = lead.get("printed_status", "")
        services  = lead.get("services", "")
        qty       = lead.get("quantity", "")
        name      = lead.get("name", "")
        name_part = f" {name.split()[0]}" if name and name not in ("Customer", "Rareprint.in") else ""
        prod_label = product or "medicine pouch"
        slot = delay // (3 * 3600)  # 0=3hr, 1=6hr, 2=9hr, 3=12hr, 4=15hr, 5=18hr, 6=21hr

        # ── PRICE OBJECTION: override with discount/offer messages ───────────
        if price_objection:
            slot = delay // (3 * 3600)
            price_msgs = [
                # Slot 0 — 5% discount offer
                (
                    f"{greeting}{name_part}! Aapki baat sun ke laga rate pe thodi help karni chahiye.\n\n"
                    f"Aapke liye *5% special discount* de sakte hain — "
                    f"sirf aapke liye, limited time ke liye. 🎁\n\n"
                    f"10,000 {prod_label} pe discount ke baad bhi ROI 5x+ hoga. "
                    f"Abhi confirm karein? ₹500 token se slot lock hota hai."
                ),
                # Slot 1 — Free stickers offer
                (
                    f"{greeting}{name_part}! Rate ki baat ho rahi thi — toh ek special offer:\n\n"
                    f"*10,000 medicine pouches ke saath 10,000 prescription stickers BILKUL FREE.*\n"
                    f"Stickers ki value ₹2,499/- hai — aapko FREE mil rahi hai.\n\n"
                    f"Effective rate kaafi better ho jaata hai. Ye offer sirf current batch ke saath hai. 🎁"
                ),
                # Slot 2 — Combo offer
                (
                    f"{greeting}{name_part}! Ek aur option jo rate problem solve karta hai:\n\n"
                    f"🎁 *COMBO OFFER — Teen sizes ek saath:*\n"
                    f"5,000 Small + 5,000 Medium + 5,000 Large\n"
                    f"Normal: ₹16,500/- → *Aapke liye: ₹14,500/-*\n"
                    f"*₹2,000 flat savings!*\n\n"
                    f"Teen sizes mein har patient ke liye sahi pouch. "
                    f"Ek baar mein sab sorted. ₹500 se confirm karein."
                ),
                # Slot 3 — All offers combined
                (
                    f"{greeting}{name_part}! Aapke liye best deal package:\n\n"
                    f"✅ *5% discount* on order\n"
                    f"✅ *10,000 prescription stickers FREE* (₹2,499 value)\n"
                    f"✅ *Combo option:* 3 sizes = ₹14,500/- (₹2,000 savings)\n"
                    f"✅ *Trial option:* 2,000 pcs = Small ₹2,500 | Medium ₹2,800 | Large ₹3,500\n\n"
                    f"In sab mein se koi bhi option choose karein — "
                    f"₹500 token se kaam shuru hota hai. Kaunsa best lagta hai? 😊"
                ),
            ]
            idx = min(slot, len(price_msgs) - 1)
            return price_msgs[idx]

        # ── ADVANCE PAYMENT OBJECTION ─────────────────────────────────────
        if advance_objection:
            slot = delay // (3 * 3600)
            advance_msgs = [
                # Slot 0 — Explain 50% policy clearly
                (
                    f"{greeting}{name_part}! Payment ke baare mein ek baar clearly bata deta hoon:\n\n"
                    f"Rareprint ka standard — *50% advance printing shuru hone se pehle, 50% dispatch se pehle.*\n\n"
                    f"Ye poori delivery par nahi hota — printing mein material cost, labor sab pehle lagta hai. "
                    f"Isliye 50% advance lena zaroori hai.\n\n"
                    f"Aur ₹500 token sirf slot book karne ke liye hai — "
                    f"ye advance ka hissa nahi, upar se benefit hai. 😊"
                ),
                # Slot 1 — Trust building + 50% justification
                (
                    f"{greeting}{name_part}! Samajh sakta hoon advance dene mein hesitation hoti hai.\n\n"
                    f"Isliye trust ke liye:\n"
                    f"✅ GST: 27GEKPP2259Q1ZI — portal par verify karein\n"
                    f"✅ Amazon, IndiaMART, TradeIndia listed\n"
                    f"✅ 2,400+ customers all over India\n\n"
                    f"*50% advance printing start hone se pehle* — ye company ka standard rule hai, "
                    f"kisi ke liye change nahi hota. Ye aapki security bhi hai — printing shuru hoti hai tabhi."
                ),
                # Slot 2 — Last resort: 30% minimum
                (
                    f"{greeting}{name_part}! Aapke liye ek special exception kar sakte hain — "
                    f"sirf ek baar:\n\n"
                    f"*Minimum 30% advance* se bhi kaam shuru ho sakta hai.\n\n"
                    f"5,000 small pouches ke liye:\n"
                    f"Total: ₹4,999/- → 30% advance = sirf *₹1,500/-*\n"
                    f"Baaki 70% dispatch se pehle.\n\n"
                    f"Ye humari last concession hai. Kya is par agree kar sakte hain? 🙏"
                ),
            ]
            idx = min(slot, len(advance_msgs) - 1)
            return advance_msgs[idx]

        # ── SMART: ask next unanswered question — city only once ──────────
        if not city and "city" not in asked and slot == 0:
            return (
                f"{greeting}{name_part}! {prod_label} ki baat ho rahi thi.\n\n"
                f"Aapka city kaunsa hai? Wahan ke Rareprint customers ke naam share kar sakta hoon — "
                f"directly unse baat kar sakte hain for reference. 📍"
            )
        if not printed and "printed_status" not in asked:
            return (
                f"{greeting}{name_part}! Ek quick sawaal — abhi aap printed pouch use karte hain ya plain?\n\n"
                f"Plain pouch mein aapka number nahi hota. Customer dawa khatam hone par doosri shop jaata hai. "
                f"Printed pouch se woh aapko directly call karta hai. Ye ek simple change hai jo repeat business badhata hai."
            )
        if not services and "services" not in asked:
            return (
                f"{greeting}{name_part}! Aap home delivery dete hain? Ya koi discount/offer?\n\n"
                f"Printed pouch par ye sab prominently print ho sakta hai — "
                f"har pouch ek moving advertisement ban jaata hai. "
                f"Customers khud aapke offers ke baare mein poochhne lagte hain."
            )
        if not qty and "quantity" not in asked:
            return (
                f"{greeting}{name_part}! {prod_label} ke liye roughly kitni quantity soch rahe hain?\n\n"
                f"5,000 / 10,000 / 20,000 — teen options mein se kaun sa comfortable hai? "
                f"10,000 par rate better hota hai aur 10,000 prescription stickers BILKUL FREE milte hain."
            )

        # ── 7 UNIQUE SLOTS — strictly no repeats ──────────────────────────
        messages = [

            # SLOT 0 (3hr) — ROI CALCULATION
            (
                f"{greeting}{name_part}! 💰 Ek simple calculation dekho:\n\n"
                f"10,000 medicine pouches = ₹7,999/-\n"
                f"Sirf 1% patients wapas aayein = 100 extra customers\n"
                f"100 × ₹500 average bill = *₹50,000 extra revenue*\n\n"
                f"Investment ₹7,999 → Return ₹50,000. ROI 6x — *pehle mahine mein hi.*\n\n"
                f"Sirf ₹500 token se production slot book hota hai. Aaj confirm karein? 🚀"
            ),

            # SLOT 1 (6hr) — REAL CUSTOMER TESTIMONIAL
            (
                f"{greeting}{name_part}! 🏆 Ek real customer ki success story:\n\n"
                f"*Pune ke Agarwal Medical Store* ne 10,000 pouches liye.\n"
                f"3 mahine mein 60+ new regular patients bane.\n"
                f"Printed pouch pe unka number tha — patients seedha call karne lage.\n"
                f"Ab woh har 4 mahine mein reorder karte hain. 🔄\n\n"
                f"Aapke {city or 'city'} mein bhi aisa ho sakta hai.\n"
                f"₹500 se slot confirm karein — kaam shuru ho jaayega."
            ),

            # SLOT 2 (9hr) — GROWTH TIP FOR MEDICAL SHOPS
            (
                f"{greeting}{name_part}! 📈 *Medical shop growth tip:*\n\n"
                f"Ek study mein paya gaya — printed pouch use karne wali shops ka "
                f"repeat customer rate plain pouch wali shops se *2.5x zyada* hota hai.\n\n"
                f"Reason: Aapka naam, number, services — har baar patient ke haath mein jaata hai.\n"
                f"Dawa khatam → patient seedha *aapko* call karta hai, doosri shop nahi jaata.\n\n"
                f"Ye ek baar ka investment hai jo saalon tak kaam karta hai. 💡"
            ),

            # SLOT 3 (12hr) — TRUST / AUTHORITY / GST / WEBSITE
            (
                f"{greeting}{name_part}! ✅ Rareprint ke baare mein kuch facts:\n\n"
                f"🏢 GST Registered: *27GEKPP2259Q1ZI*\n"
                f"   (aap GST portal par verify kar sakte hain)\n"
                f"👥 *2,400+ customers* across India — har state mein\n"
                f"🛒 Listed on *Amazon, IndiaMART, TradeIndia*\n"
                f"🌐 Website: *www.rareprint.in*\n"
                f"📞 +91 9637318960\n\n"
                f"Risk-free order — 50% COD available. ₹500 se slot book karein."
            ),

            # SLOT 4 (15hr) — OFFERS & DISCOUNTS
            (
                f"{greeting}{name_part}! 🎁 Aapke liye special offers:\n\n"
                f"*Offer 1:* 5% discount — sirf aapke liye, is order pe\n\n"
                f"*Offer 2:* 10,000 pouches ke saath 10,000 prescription stickers FREE\n"
                f"(Stickers market value ₹2,499 — bilkul free!)\n\n"
                f"*Offer 3 — COMBO DEAL:*\n"
                f"5,000 Small + 5,000 Medium + 5,000 Large = *₹14,500/-*\n"
                f"Normal price ₹16,500/- — *₹2,000 flat savings!*\n\n"
                f"*Trial option:* 2,000 pcs — Small ₹2,500 | Medium ₹2,800 | Large ₹3,500\n\n"
                f"Kaunsa best suit karta hai? ₹500 se confirm hota hai. 😊"
            ),

            # SLOT 5 (18hr) — QUIZ (image sent in _tick before this message)
            (
                f"{greeting}{name_part}! 🎉 *FREE pouches jeetne ka mauka!*\n\n"
                f"Rareprint ke Instagram par *Doctor Logo Quiz* chal raha hai.\n"
                f"Sahi jawab dene wale *pehle 100 logon* ko milenge:\n"
                f"✅ *500 readymade medicine pouches BILKUL FREE*\n"
                f"✅ Sirf courier charges lagenge\n\n"
                f"Step 1️⃣ @rareprint.in follow karein\n"
                f"Step 2️⃣ Neeche comment karein: *A ya B?*\n"
                f"👉 https://www.instagram.com/p/DY9yNaAjPke/\n\n"
                f"Jaldi — slots almost full! ⏳"
            ),

            # SLOT 6 (21hr) — PRODUCT SHOWCASE + FINAL SOFT CLOSE
            (
                f"{greeting}{name_part}! Rareprint ke kuch popular products:\n\n"
                f"💊 *Medicine Pouches* — Small/Medium/Large/XL\n"
                f"🏷️ *Prescription Stickers* — 5,000 pcs se ₹1,699/-\n"
                f"📁 *Doctor Files* — Art Card, Duplex, PVC\n"
                f"🧴 *Carry Bags* — Non-woven, D-Cut\n"
                f"🔑 *Keychains & Pens* — Branded gifts\n"
                f"🃏 *Visiting Cards* — 350 GSM premium\n\n"
                f"Full catalog: *www.rareprint.in*\n\n"
                f"Kabhi bhi message karein — hum 24/7 available hain. "
                f"Jab ready hon — ₹500 se shuru hota hai! 😊"
            ),
        ]
        idx = min(slot, len(messages) - 1)
        return messages[idx]

    async def _localize_message(self, message: str, session: dict) -> str:
        lead = session.get("lead") or {}
        language_hint = lead.get("language_hint")
        if not self.agent or not getattr(self.agent, "ai", None) or not language_hint:
            return message
        if language_hint == "Latin English/Hinglish/transliteration":
            return message

        try:
            return await asyncio.to_thread(self._translate_message, message, language_hint)
        except Exception as e:
            logger.warning(f"Follow-up localization failed: {e}")
            return message

    def _translate_message(self, message: str, language_hint: str) -> str:
        model = self.agent.ai
        response = model.generate_content(
            f"Rewrite this WhatsApp f