"""
AiSensy Project API Client
════════════════════════════
Uses AiSensy's Project API (same API family as the webhook).
Endpoint: https://backend.aisensy.com/direct-apis/t1/messages

Payload mirrors the webhook format:
  phone_number    → same field name as incoming webhook
  message_content → same structure as incoming webhook
"""

import os
import logging
import httpx

logger = logging.getLogger(__name__)

# Project API endpoint (same API family that sends webhook events)
SEND_API = "https://backend.aisensy.com/direct-apis/t1/messages"


class AiSensyClient:
    def __init__(self, api_key: str):
        self.api_key  = api_key
        self.username = os.getenv("AISENSY_USERNAME", "RAREPRINT3")

        if not api_key:
            logger.warning("⚠️  AISENSY_API_KEY not set — messages will not be sent")

    # ── Core sender ─────────────────────────────────────────────────────────
    def _post(self, payload: dict) -> bool:
        if not self.api_key:
            logger.error("Cannot send — AISENSY_API_KEY missing")
            return False

        # API key goes in request body, not header
        payload["apiKey"] = self.api_key

        try:
            resp = httpx.post(SEND_API, json=payload, timeout=15)
            logger.info(f"AiSensy [{resp.status_code}] → {resp.text[:400]}")
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Network error: {e}")
            return False

    # ── Text message ─────────────────────────────────────────────────────────
    def send_text(self, phone: str, text: str) -> bool:
        payload = {
            "phone_number": phone,
            "message_content": {
                "type": "text",
                "text": text,
            }
        }
        logger.info(f"→ TEXT {phone}: {text[:60]}")
        return self._post(payload)

    # ── Image message ─────────────────────────────────────────────────────────
    def send_image(self, phone: str, image_url: str, caption: str = "") -> bool:
        payload = {
            "phone_number": phone,
            "message_content": {
                "type": "image",
                "url": image_url,
                "caption": caption,
            }
        }
        logger.info(f"→ IMAGE {phone}: {image_url[:60]}")
        return self._post(payload)

    # ── Video message ─────────────────────────────────────────────────────────
    def send_video(self, phone: str, video_url: str, caption: str = "") -> bool:
        payload = {
            "phone_number": phone,
            "message_content": {
                "type": "video",
                "url": video_url,
                "caption": caption,
            }
        }
        logger.info(f"→ VIDEO {phone}: {video_url[:60]}")
        return self._post(payload)

    # ── Product template ─────────────────────────────────────────────────────
    def send_product_template(self, phone: str, product: dict) -> bool:
        """
        Fixed template every time a product is enquired about:
        1. Video or Image
        2. Rates as text
        3. Terms of Service as text
        """
        if product.get("media_url"):
            if product.get("media_type") == "video":
                self.send_video(phone, product["media_url"])
            else:
                self.send_image(phone, product["media_url"])

        self.send_text(phone, product["rates"])

        from products import GLOBAL_TOS
        self.send_text(phone, product.get("tos", GLOBAL_TOS))

        return True

    # ── Payment details ───────────────────────────────────────────────────────
    def send_payment_link(self, phone: str, product: dict) -> bool:
        from products import PAYMENT_DETAILS
        msg = (
            f"💳 *Ready to order {product['name']}?*\n\n"
            f"{PAYMENT_DETAILS}\n\n"
            "_Send payment screenshot after transfer._\n"
            "_Then share your design file (PDF/AI/CDR) here to start! 🎨_"
        )
        return self.send_text(phone, msg)
