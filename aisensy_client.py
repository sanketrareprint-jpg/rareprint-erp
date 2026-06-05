"""
AiSensy Project API Client
════════════════════════════
Endpoint: POST https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages
Auth:     Header  X-AiSensy-Project-API-Pwd: YOUR_APP_PASSWORD
Docs:     https://aisensy.stoplight.io/docs/project-api/effdec8a4894f-send-message
"""

import os
import logging
import asyncio
from urllib.parse import quote
import httpx

logger = logging.getLogger(__name__)

PROJECT_ID     = os.getenv("AISENSY_PROJECT_ID", "67727bb67127df0c20798c5d")
SEND_API       = f"https://apis.aisensy.com/project-apis/v1/project/{PROJECT_ID}/messages"
PAYMENT_QR_URL = os.getenv("PAYMENT_QR_URL", "").strip()
_QR_FALLBACK   = "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/phonepe_qr.jpg"


def _encode_url(url: str) -> str:
    """URL-encode spaces in CDN filenames (e.g. 'SMALL MEDICINE POUCH.mp4')."""
    if not url:
        return url
    parts = url.split("?", 1)
    path  = quote(parts[0], safe="/:@.!~*'(),-_")
    return path + ("?" + parts[1] if len(parts) > 1 else "")


class AiSensyClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        if not api_key:
            logger.warning("⚠️  AISENSY_API_KEY not set — messages will not be sent")

    # ── Core async sender ────────────────────────────────────────────────────
    async def _apost(self, payload: dict) -> bool:
        if not self.api_key:
            logger.error("Cannot send — AISENSY_API_KEY missing")
            return False
        headers = {
            "Content-Type":              "application/json",
            "Accept":                    "application/json",
            "X-AiSensy-Project-API-Pwd": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(SEND_API, json=payload, headers=headers)
            logger.info(f"AiSensy [{resp.status_code}] → {resp.text[:300]}")
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Network error: {e}")
            return False

    # ── Text message ─────────────────────────────────────────────────────────
    async def send_text(self, phone: str, text: str) -> bool:
        payload = {
            "to": phone, "type": "text", "recipient_type": "individual",
            "text": {"body": text},
        }
        logger.info(f"→ TEXT {phone}: {text[:60]}")
        return await self._apost(payload)

    # ── Image message ─────────────────────────────────────────────────────────
    async def send_image(self, phone: str, image_url: str, caption: str = "") -> bool:
        url = _encode_url(image_url)
        payload = {
            "to": phone, "type": "image", "recipient_type": "individual",
            "image": {"link": url, "caption": caption},
        }
        logger.info(f"→ IMAGE {phone}: {url[:60]}")
        return await self._apost(payload)

    # ── Video message ─────────────────────────────────────────────────────────
    async def send_video(self, phone: str, video_url: str, caption: str = "") -> bool:
        url = _encode_url(video_url)
        payload = {
            "to": phone, "type": "video", "recipient_type": "individual",
            "video": {"link": url, "caption": caption},
        }
        logger.info(f"→ VIDEO {phone}: {url[:60]}")
        return await self._apost(payload)

    # ── Document message ─────────────────────────────────────────────────────
    async def send_document(self, phone: str, document_url: str, filename: str = "", caption: str = "") -> bool:
        url = _encode_url(document_url)
        payload = {
            "to": phone, "type": "document", "recipient_type": "individual",
            "document": {"link": url, "filename": filename or "Rareprint catalog.pdf", "caption": caption},
        }
        logger.info(f"→ DOCUMENT {phone}: {url[:60]}")
        return await self._apost(payload)

    # ── Interactive buttons ───────────────────────────────────────────────────
    async def send_buttons(self, phone: str, body_text: str, buttons: list[str]) -> bool:
        btn_list = [
            {"type": "reply", "reply": {"id": f"btn_{i}", "title": title[:20]}}
            for i, title in enumerate(buttons[:3])
        ]
        payload = {
            "to": phone, "type": "interactive", "recipient_type": "individual",
            "interactive": {
                "type": "button",
                "body": {"text": body_text},
                "action": {"buttons": btn_list},
            },
        }
        logger.info(f"→ BUTTONS {phone}: {body_text[:40]}")
        return await self._apost(payload)

    # ── Carousel ─────────────────────────────────────────────────────────────
    async def send_carousel(self, phone: str, cards: list[dict]) -> bool:
        carousel_cards = []
        for card in cards[:10]:
            c = {
                "header": {"type": "image", "image": {"link": _encode_url(card.get("image_url", ""))}},
                "body":   {"text": card.get("body", "")},
                "action": {"buttons": [
                    {"type": "reply", "reply": {"id": card.get("id", "c"), "title": card.get("button", "Select")[:20]}}
                ]},
            }
            carousel_cards.append(c)
        payload = {
            "to": phone, "type": "interactive", "recipient_type": "individual",
            "interactive": {"type": "carousel", "action": {"cards": carousel_cards}},
        }
        logger.info(f"→ CAROUSEL {phone}: {len(carousel_cards)} cards")
        return await self._apost(payload)

    # ── Product template (video/image + rates text) ───────────────────────────
    async def send_product_template(self, phone: str, product: dict) -> bool:
        media_url = product.get("media_url", "")
        if media_url:
            media_type = product.get("media_type", "image")
            if media_type == "video":
                ok = await self.send_video(phone, media_url)
                if not ok:
                    photo = product.get("photo_url", "")
                    if photo:
                        await self.send_image(phone, photo)
            elif media_type == "document":
                await self.send_document(phone, media_url, f"{product['name']} Catalogue.pdf")
            else:
                await self.send_image(phone, media_url)

        await self.send_text(phone, product["rates"])
        return True

    # ── Payment link ─────────────────────────────────────────────────────────
    async def send_payment_link(self, phone: str, product: dict) -> bool:
        from products import PAYMENT_DETAILS
        qr_url = PAYMENT_QR_URL or _QR_FALLBACK
        if qr_url:
            await self.send_image(
                phone, qr_url,
                "📱 Scan karein – PhonePe / GPay / Paytm / Any UPI"
            )
        msg = (
            f"💰 *₹500 Token Amount Bhejein*\n\n"
            f"Yeh sirf design confirmation ke liye hai.\n"
            f"Final invoice mein adjust ho jayega. ✅\n\n"
            f"{PAYMENT_DETAILS}\n\n"
            f"_Payment screenshot yahan bhejein. Uske baad hum design matter lenge aur kaam shuru karenge! 🎨_"
        )
        return await self.send_text(phone, msg)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           