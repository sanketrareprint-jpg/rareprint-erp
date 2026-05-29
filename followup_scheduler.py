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
DEFAULT_DELAYS = [10 * 60, 60 * 60, 3 * 60 * 60, 23 * 60 * 60]


class FollowUpScheduler:
    def __init__(self, store: ConversationStore, client: AiSensyClient):
        self.store = store
        self.client = client
        self.enabled = os.getenv("FOLLOWUP_ENABLED", "true").lower() not in ["0", "false", "off", "no"]
        self.poll_seconds = int(os.getenv("FOLLOWUP_POLL_SECONDS", "60"))
        self.delays = self._parse_delays(os.getenv("FOLLOWUP_DELAYS_SECONDS", ""))
        self._task: asyncio.Task | None = None

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

            delay = max(due_delays)
            message = self._message_for_delay(delay, session)
            ok = await asyncio.to_thread(self.client.send_text, phone, message)
            if ok:
                for old_delay in self.delays:
                    if old_delay <= delay:
                        self.store.mark_followup_sent(phone, str(old_delay), last_customer)
                self.store.add_message(phone, "assistant", message)
                logger.info(f"Follow-up sent to {phone} after {delay} seconds")

    def _message_for_delay(self, delay: int, session: dict) -> str:
        greeting = self._time_greeting()
        lead = session.get("lead") or {}
        product = lead.get("product") or "printing"

        if delay <= 10 * 60:
            return f"{greeting} Sir/Madam, {product} ke rates/details share kiye the. Aapka city bata dijiye, main nearby delivery/reference check kar deta hoon."
        if delay <= 60 * 60:
            return f"{greeting} Sir/Madam, ek quick question: abhi aap printed pouch/item use kar rahe hain ya plain?"
        if delay <= 3 * 60 * 60:
            return f"{greeting} Sir/Madam, printed pouch sirf packing nahi hota, repeat customer aur local branding ke liye kaam aata hai. Aap home delivery ya discount bhi dete hain?"
        return f"{greeting} Sir/Madam, 24 hours ke andar yahin reply kar denge toh main same chat mein help kar dunga. Aapko {product} ke liye quantity final karni hai?"

    def _time_greeting(self) -> str:
        hour = datetime.now(ZoneInfo("Asia/Kolkata")).hour
        if 5 <= hour < 12:
            return "Good morning"
        if 12 <= hour < 17:
            return "Good afternoon"
        return "Good evening"

    def _parse_delays(self, raw: str) -> list[int]:
        if not raw.strip():
            return DEFAULT_DELAYS
        delays = []
        for item in raw.split(","):
            try:
                value = int(item.strip())
            except ValueError:
                continue
            if 0 < value < CUSTOMER_WINDOW_SECONDS:
                delays.append(value)
        return sorted(set(delays)) or DEFAULT_DELAYS
