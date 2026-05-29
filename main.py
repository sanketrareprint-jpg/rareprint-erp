"""
AiSensy WhatsApp AI Sales Chatbot — Webhook Server
FastAPI server that receives AiSensy webhook events and routes them to the AI agent.
"""

import os
import json
import pathlib
import logging
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, HTMLResponse
import uvicorn

from ai_agent import SalesAgent
from conversation_store import ConversationStore
from aisensy_client import AiSensyClient
import products as products_module

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="WhatsApp AI Sales Bot")

# ── Runtime config store (persists in memory, survives requests) ─────────────
BASE_DIR    = pathlib.Path(__file__).parent
CONFIG_FILE = BASE_DIR / "runtime_config.json"

def load_runtime_config() -> dict:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    return {}

def save_runtime_config(data: dict):
    existing = load_runtime_config()
    existing.update(data)
    CONFIG_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")

RUNTIME_CONFIG = load_runtime_config()

# ── Singletons ──────────────────────────────────────────────────────────────
# Free-flow webhook mode — no campaigns used
store  = ConversationStore()
client = AiSensyClient(api_key=os.getenv("AISENSY_API_KEY", ""))
agent  = SalesAgent(store=store, client=client)


# ── Health check ────────────────────────────────────────────────────────────
@app.get("/")
async def health():
    return {"status": "ok", "service": "WhatsApp AI Sales Bot"}


# ── Also accept webhook at root / (in case AiSensy posts here) ──────────────
@app.post("/")
async def webhook_root(request: Request, background_tasks: BackgroundTasks):
    return await webhook(request, background_tasks)


# ── Browser chat test UI ─────────────────────────────────────────────────────
@app.get("/test", response_class=HTMLResponse)
async def chat_ui():
    import pathlib
    html_file = pathlib.Path(__file__).parent / "chat_ui.html"
    try:
        return HTMLResponse(content=html_file.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return HTMLResponse("<h2>chat_ui.html not found</h2>", status_code=404)


# ── Chat API for test UI ──────────────────────────────────────────────────────
@app.post("/chat")
async def chat_direct(request: Request):
    """
    Direct chat endpoint for browser test UI.
    Bypasses AiSensy — returns bot messages as JSON instead of sending to WhatsApp.
    """
    body = await request.json()
    phone      = body.get("phone", "test_user")
    name       = body.get("name", "Tester")
    text       = body.get("text", "")
    session_id = body.get("session_id", phone)

    if not text:
        return JSONResponse({"messages": []})

    # Use session_id as phone so each browser tab gets its own conversation
    msg_data = {
        "phone":      session_id,
        "name":       name,
        "text":       text,
        "media_type": "text",
        "media_url":  "",
        "message_id": "",
    }

    # Capture bot messages instead of sending to WhatsApp
    captured = []
    original_send_text    = client.send_text
    original_send_image   = client.send_image
    original_send_video   = client.send_video

    def cap_text(phone, msg):
        captured.append({"type": "text", "content": msg})
        return True

    def cap_image(phone, url, caption=""):
        captured.append({"type": "image", "url": url, "caption": caption})
        return True

    def cap_video(phone, url, caption=""):
        captured.append({"type": "video", "url": url, "caption": caption})
        return True

    client.send_text  = cap_text
    client.send_image = cap_image
    client.send_video = cap_video

    try:
        await agent.handle_message(msg_data)
    finally:
        client.send_text  = original_send_text
        client.send_image = original_send_image
        client.send_video = original_send_video

    return JSONResponse({"messages": captured})


# ── Webhook endpoint ─────────────────────────────────────────────────────────
@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        payload = await request.json()

        logger.info(
            "FULL PAYLOAD:\n%s",
            json.dumps(payload, indent=2, ensure_ascii=False)
        )

    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("topic") or payload.get("event") or payload.get("type") or ""
    logger.info(f"Webhook event: {event} | {json.dumps(payload)[:200]}")

    # Only respond to customer messages — ignore system events
    if event and event != "message.sender.user":
        logger.info(f"Ignoring event: {event}")
        return JSONResponse({"status": "ignored", "event": event})

    message_data = _extract_message(payload)
    if message_data:
        background_tasks.add_task(agent.handle_message, message_data)

    return JSONResponse({"status": "received"})


def _extract_message(payload: dict) -> dict | None:
    try:
        data = payload.get("data") or payload
        msg_obj = data.get("message") or data
        contact = data.get("contact") or {}

        phone = (
            msg_obj.get("phone_number")
            or msg_obj.get("phone")
            or msg_obj.get("waId")
            or contact.get("phone_number")
            or contact.get("phone")
            or contact.get("waId")
            or data.get("phone_number")
            or data.get("phone")
            or data.get("from")
            or data.get("waId")
            or data.get("customer_phone")
        )

        if not phone:
            logger.warning("No phone found in payload")
            return None

        phone = str(phone).replace("+", "").replace(" ", "").replace("-", "")

        name = (
            msg_obj.get("userName")
            or contact.get("name")
            or contact.get("pushname")
            or data.get("name")
            or data.get("customer_name")
            or "Customer"
        )

        content = msg_obj.get("message_content") or {}

        msg_type = (
            msg_obj.get("message_type")
            or msg_obj.get("type")
            or "text"
        )

        text = (
            content.get("text")
            or content.get("title")
            or content.get("callbackPayload")
            or msg_obj.get("text")
            or msg_obj.get("body")
            or ""
        )

        media_url = (
            content.get("url")
            or content.get("link")
            or msg_obj.get("url")
            or msg_obj.get("link")
            or ""
        )

        message_id = (
            msg_obj.get("messageId")
            or msg_obj.get("_id")
            or msg_obj.get("id")
            or data.get("messageId")
            or ""
        )

        logger.info(f"📨 Parsed: phone={phone} name={name} text={text[:60]}")

        return {
            "phone": phone,
            "name": name,
            "text": text.strip(),
            "media_type": msg_type,
            "media_url": media_url,
            "message_id": message_id,
        }

    except Exception as e:
        logger.error(f"Failed to extract message: {e}")
        return None


# ── Admin UI ─────────────────────────────────────────────────────────────────
@app.get("/admin", response_class=HTMLResponse)
async def admin_ui():
    html_file = BASE_DIR / "admin_ui.html"
    try:
        return HTMLResponse(content=html_file.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return HTMLResponse("<h2>admin_ui.html not found</h2>", status_code=404)


@app.get("/admin/config")
async def get_config():
    """Return current runtime config to admin UI."""
    from ai_agent import build_system_prompt
    from products import GLOBAL_TOS, PAYMENT_DETAILS

    cfg = load_runtime_config()
    return JSONResponse({
        "system_prompt":    cfg.get("system_prompt",    build_system_prompt()),
        "payment_details":  cfg.get("payment_details",  PAYMENT_DETAILS),
        "global_tos":       cfg.get("global_tos",       GLOBAL_TOS),
        "welcome_message":  cfg.get("welcome_message",  "👋 Hello! Welcome to *Rareprint*.\nWhat would you like to print today? 😊"),
        "fallback_message": cfg.get("fallback_message", "Sorry, I didn't get that. Call us: +91 9699349563\nWhat would you like to print?"),
    })


@app.post("/admin/config")
async def update_config(request: Request):
    """Save runtime config from admin UI."""
    data = await request.json()
    save_runtime_config(data)
    RUNTIME_CONFIG.update(data)
    # Patch ai_agent system prompt live
    if "system_prompt" in data:
        import ai_agent
        ai_agent.CUSTOM_SYSTEM_PROMPT = data["system_prompt"]
    logger.info(f"Admin config updated: {list(data.keys())}")
    return JSONResponse({"status": "saved"})


@app.get("/admin/products")
async def get_products():
    """Return product catalog to admin UI."""
    cfg = load_runtime_config()
    prods = cfg.get("products", None)
    if prods is None:
        # Return from products.py as default
        from products import PRODUCTS
        prods = {k: {
            "name":         v["name"],
            "media_type":   v.get("media_type", "image"),
            "media_url":    v.get("media_url", ""),
            "rates":        v.get("rates", ""),
            "keywords":     v.get("keywords", []),
            "payment_link": v.get("payment_link", ""),
        } for k, v in PRODUCTS.items()}
    return JSONResponse(prods)


@app.post("/admin/products")
async def update_products(request: Request):
    """Save product catalog from admin UI."""
    data = await request.json()
    save_runtime_config({"products": data})
    RUNTIME_CONFIG["products"] = data
    logger.info(f"Products updated via admin: {len(data)} products")
    return JSONResponse({"status": "saved"})


# ── Debug: try all payload formats ───────────────────────────────────────────
@app.get("/debug-send")
async def debug_send():
    """
    Tries every known AiSensy payload format and returns which ones succeed.
    Visit: https://your-domain.railway.app/debug-send
    """
    import httpx
    api_key = os.getenv("AISENSY_API_KEY", "")
    phone   = "919637318960"   # test phone
    msg     = "Test from Rareprint bot"

    formats = {
        "f1_phone_number_message_content": {
            "apiKey": api_key,
            "phone_number": phone,
            "message_content": {"text": msg},
        },
        "f2_plus_prefix": {
            "apiKey": api_key,
            "phone_number": f"+{phone}",
            "message_content": {"text": msg},
        },
        "f3_destination_flat": {
            "apiKey": api_key,
            "destination": phone,
            "message": msg,
        },
        "f4_destination_message_content": {
            "apiKey": api_key,
            "destination": phone,
            "message_content": {"text": msg},
        },
        "f5_with_project_id": {
            "apiKey": api_key,
            "phone_number": phone,
            "project_id": "67727bb67127df0c20798c5d",
            "message_content": {"text": msg},
        },
        "f6_to_field": {
            "apiKey": api_key,
            "to": phone,
            "type": "text",
            "text": {"body": msg},
        },
        "f7_phone_message_flat": {
            "apiKey": api_key,
            "phone": phone,
            "message": msg,
        },
    }

    results = {}
    for name, payload in formats.items():
        try:
            r = httpx.post(
                "https://backend.aisensy.com/direct-apis/t1/messages",
                json=payload, timeout=10
            )
            results[name] = {"status": r.status_code, "body": r.text[:200]}
        except Exception as e:
            results[name] = {"status": "error", "body": str(e)}

    return JSONResponse(results)


# ── Run locally ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
