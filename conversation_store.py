"""
Conversation Store
══════════════════
Tracks per-user conversation history and lead data.
Uses in-memory storage by default (data resets on restart).

For production, set REDIS_URL env var to persist across restarts.
"""

import os
import json
import time
from collections import defaultdict
from typing import Optional

try:
    import redis
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False


MAX_HISTORY = 20
SESSION_TTL = 60 * 60 * 30  # 30 hours — keeps the 24-hour WhatsApp follow-up window


class ConversationStore:
    def __init__(self):
        redis_url = os.getenv("REDIS_URL")
        self._redis: Optional[object] = None

        if redis_url and _REDIS_AVAILABLE:
            try:
                self._redis = redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                print("✅ Redis connected — sessions will persist")
            except Exception as e:
                print(f"⚠️  Redis failed ({e}), falling back to in-memory")
                self._redis = None

        # In-memory fallback
        self._memory: dict[str, dict] = defaultdict(lambda: {
            "history":    [],
            "lead":       {},
            "state":      "greeting",   # greeting / product_sent / collecting / closed
            "last_active": 0,
            "last_customer_message_at": 0,
            "last_bot_message_at": 0,
            "followups_sent": {},
            "asked_questions": [],
            "last_question_key": "",
            "seen_message_ids": [],
        })

    # ── Read / Write ─────────────────────────────────────────────────────────
    def get_session(self, phone: str) -> dict:
        if self._redis:
            raw = self._redis.get(f"session:{phone}")
            if raw:
                data = json.loads(raw)
                # Expire stale sessions
                if time.time() - data.get("last_active", 0) > SESSION_TTL:
                    return self._default_session()
                return data
            return self._default_session()
        else:
            session = self._memory[phone]
            if time.time() - session["last_active"] > SESSION_TTL and session["last_active"] > 0:
                self._memory[phone] = self._default_session()
            return self._memory[phone]

    def save_session(self, phone: str, session: dict):
        session["last_active"] = time.time()
        if self._redis:
            self._redis.setex(
                f"session:{phone}",
                SESSION_TTL,
                json.dumps(session)
            )
        else:
            self._memory[phone] = session

    def add_message(self, phone: str, role: str, content: str):
        """Append a message and trim to MAX_HISTORY."""
        session = self.get_session(phone)
        session["history"].append({"role": role, "content": content})
        now = time.time()
        if role == "user":
            session["last_customer_message_at"] = now
            session["followups_sent"] = {}
        elif role == "assistant":
            session["last_bot_message_at"] = now
        # Keep only the last N messages
        session["history"] = session["history"][-MAX_HISTORY:]
        self.save_session(phone, session)

    def get_history(self, phone: str) -> list[dict]:
        return self.get_session(phone)["history"]

    def update_lead(self, phone: str, **kwargs):
        """Update lead data fields (name, email, city, design_details, etc.)."""
        session = self.get_session(phone)
        session["lead"].update(kwargs)
        self.save_session(phone, session)

    def get_lead(self, phone: str) -> dict:
        return self.get_session(phone)["lead"]

    def set_state(self, phone: str, state: str):
        session = self.get_session(phone)
        session["state"] = state
        self.save_session(phone, session)

    def get_state(self, phone: str) -> str:
        return self.get_session(phone).get("state", "greeting")

    def already_seen_message(self, phone: str, message_id: str) -> bool:
        if not message_id:
            return False
        session = self.get_session(phone)
        seen = session.get("seen_message_ids") or []
        if message_id in seen:
            return True
        seen.append(message_id)
        session["seen_message_ids"] = seen[-100:]
        self.save_session(phone, session)
        return False

    def mark_question_asked(self, phone: str, question_key: str):
        if not question_key:
            return
        session = self.get_session(phone)
        asked = session.get("asked_questions") or []
        if question_key not in asked:
            asked.append(question_key)
        session["asked_questions"] = asked[-20:]
        session["last_question_key"] = question_key
        self.save_session(phone, session)

    def get_conversation_flags(self, phone: str) -> dict:
        session = self.get_session(phone)
        return {
            "asked_questions": session.get("asked_questions") or [],
            "last_question_key": session.get("last_question_key") or "",
            "last_customer_message_at": session.get("last_customer_message_at") or 0,
            "last_bot_message_at": session.get("last_bot_message_at") or 0,
            "followups_sent": session.get("followups_sent") or {},
        }

    def mark_followup_sent(self, phone: str, delay_key: str, base_at: float):
        session = self.get_session(phone)
        sent = session.get("followups_sent") or {}
        sent[delay_key] = base_at
        session["followups_sent"] = sent
        self.save_session(phone, session)

    def iter_sessions(self):
        if self._redis:
            for key in self._redis.scan_iter("session:*"):
                raw = self._redis.get(key)
                if not raw:
                    continue
                phone = key.split("session:", 1)[1]
                try:
                    data = json.loads(raw)
                except Exception:
                    continue
                if time.time() - data.get("last_active", 0) <= SESSION_TTL:
                    yield phone, data
        else:
            for phone, session in list(self._memory.items()):
                if time.time() - session.get("last_active", 0) <= SESSION_TTL:
                    yield phone, session

    def reset(self, phone: str):
        """Clear session for a user (fresh start)."""
        if self._redis:
            self._redis.delete(f"session:{phone}")
        else:
            self._memory[phone] = self._default_session()

    @staticmethod
    def _default_session() -> dict:
        return {
            "history":    [],
            "lead":       {},
            "state":      "greeting",
            "last_active": 0,
            "last_customer_message_at": 0,
            "last_bot_message_at": 0,
            "followups_sent": {},
            "asked_questions": [],
            "last_question_key": "",
            "seen_message_ids": [],
        }
