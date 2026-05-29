"""
AiSensy Project API Client
════════════════════════════
Endpoint: POST https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages
Auth:     Header  X-AiSensy-Project-API-Pwd: YOUR_APP_PASSWORD
Docs:     https://aisensy.stoplight.io/docs/project-api/effdec8a4894f-send-message
"""

import os
import logging
import httpx

logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("AISENSY_PROJECT_ID", "67727bb67127df0c20798c5d")
SEND_API   = f"https://apis.aisensy.com/project-apis/v1/project/{PROJECT_ID}/messages"


class AiSensyClient:
    def __init__(self, api_key: str):
        # api_key here = App Password from AiSensy Settings
        self.api_key = api_key
        if not api_key:
            logger.warning("⚠️  AISENSY_API_KEY not set — messages will not be sent")

    # ── Core sender ─────────────────────────────────────────────────────────
    def _post(self, payload: dict) -> bool:
        if not self.api_key:
            logger.error("Cannot send — AISENSY_API_KEY missing")
            return False

        headers = {
            "Content-Type":              "application/json",
            "Accept":                    "application/json",
            "X-AiSensy-Project-API-Pwd": self.api_key,
        }

        try:
            resp = httpx.post(SEND_API, json=payload, headers=headers, timeout=15)
            logger.info(f"AiSensy [{resp.status_code}] → {resp.text[:300]}")
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Network error: {e}")
            return False

    # ── Text message ─────────────────────────────────────────────────────────
    def send_text(self, phone: str, text: str) -> bool:
        payload = {
            "to":             phone,
            "type":           "text",
            "recipient_type": "individual",
            "text": {
                "body": text,
            }
        }
        logger.info(f"→ TEXT {phone}: {text[:60]}")
        return self._post(payload)

    # ── Image message ─────────────────────────────────────────────────────────
    def send_image(self, phone: str, image_url: str, caption: str = "") -> bool:
        payload = {
            "to":             phone,
            "type":           "image",
            "recipient_type": "individual",
            "image": {
                "link":    image_url,
                "caption": caption,
            }
        }
        logger.info(f"→ IMAGE {phone}: {image_url[:60]}")
        return self._post(payload)

    # ── Video message ─────────────────────────────────────────────────────────
    def send_video(self, phone: str, video_url: str, caption: str = "") -> bool:
        payload = {
            "to":             phone,
            "type":           "video",
            "recipient_type": "individual",
            "video": {
                "link":    video_url,
                "caption": caption,
            }
        }
        logger.info(f"→ VIDEO {phone}: {video_url[:60]}")
        return self._post(payload)

    # ── Document message ─────────────────────────────────────────────────────
    def send_document(self, phone: str, document_url: str, filename: str = "", caption: str = "") -> bool:
        payload = {
            "to":             phone,
            "type":           "document",
            "recipient_type": "individual",
            "document": {
                "link":     document_url,
                "filename": filename or "Rareprint catalog.pdf",
                "caption":  caption,
            }
        }
        logger.info(f"→ DOCUMENT {phone}: {document_url[:60]}")
        return self._post(payload)

    # ── Product template ─────────────────────────────────────────────────────
    def send_product_template(self, phone: str, product: dict) -> bool:
        if product.get("media_url"):
            if product.get("media_type") == "video":
                self.send_video(phone, product["media_url"])
            else:
                self.send_image(phone, product["media_url"])

        self.send_text(phone, product["rates"])

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
