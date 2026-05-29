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


MAX_HISTORY = 20          # messages to keep per user
SESSION_TTL = 60 * 60 * 6  # 6 hours — then start fresh


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
        }
