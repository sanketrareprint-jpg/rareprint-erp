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
from followup_scheduler import FollowUpScheduler
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
followups = FollowUpScheduler(store=store, client=client, agent=agent)


@app.on_event("startup")
async def startup():
    followups.start()


@app.on_event("shutdown")
async def shutdown():
    await followups.stop()


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
    original_send_document = client.send_document

    async def cap_text(phone, msg):
        captured.append({"type": "text", "content": msg})
        return True

    async def cap_image(phone, url, caption=""):
        captured.append({"type": "image", "url": url, "caption": caption})
        return True

    async def cap_video(phone, url, caption=""):
        captured.append({"type": "video", "url": url, "caption": caption})
        return True

    async def cap_document(phone, url, filename="", caption=""):
        captured.append({"type": "document", "url": url, "filename": filename, "caption": caption})
        return True

    client.send_text  = cap_text
    client.send_image = cap_image
    client.send_video = cap_video
    client.send_document = cap_document

    try:
        await agent.handle_message(msg_data)
    finally:
        client.send_text  = original_send_text
        client.send_image = original_send_image
        client.send_video = original_send_video
        client.send_document = original_send_document

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

        # ── Ad referral context ───────────────────────────────────────────
        referral    = msg_obj.get("referralDetails") or {}
        ad_headline = referral.get("headline", "").strip()
        ad_body     = referral.get("body", "")[:100].strip()

        # If customer sent generic "Hello! Can I get more info on this?" from ad click
        # inject the ad product context so AI knows what they're asking about
        generic_greetings = [
            "hello! can i get more info on this?",
            "hello", "hi", "hey", "hii", "hlo", "helo", "namaste", "hello.",
            "yes", "haan", "ha", "ji", "ji haan", "bilkul", "sure", "ok",
            "interested", "info", "details", "batao", "bataiye", "chahiye",
        ]
        if ad_headline and text.strip().lower() in generic_greetings:
            text = f"[FROM AD: {ad_headline}] {text}".strip()

        logger.info(f"📨 Parsed: phone={phone} name={name} text={text[:80]}")

        return {
            "phone":      phone,
            "name":       name,
            "text":       text.strip(),
            "media_type": msg_type,
            "media_url":  media_url,
            "message_id": message_id,
            "ad_headline": ad_headline,
        }

    except Exception as e:
        logger.error(f"Failed to extract message: {e}")
        return None


# ── Design Matter Form ───────────────────────────────────────────────────────
@app.get("/design/{phone}", response_class=HTMLResponse)
async def design_form(phone: str):
    lead = store.get_lead(phone)
    product = lead.get("product", "your product")
    customer_name = lead.get("name") or store.get_customer_profile(phone).get("name") or ""
    return HTMLResponse(content=_design_form_html(phone, product, customer_name))


@app.post("/design/{phone}")
async def design_form_submit(phone: str, request: Request):
    form = await request.form()
    data = dict(form)

    # Save to conversation store
    store.update_lead(phone, design_matter=json.dumps(data, ensure_ascii=False))
    store.set_state(phone, "design_submitted")

    # Save submitted files info (text only — actual files need separate handling)
    logger.info(f"Design matter received for {phone}: {data}")

    # Notify customer via WhatsApp
    fields_text = "\n".join(f"• *{k}:* {v}" for k, v in data.items() if v and k != "logo_note")
    confirmation = (
        f"✅ *Design matter mil gaya!*\n\n"
        f"{fields_text}\n\n"
        f"Hum design bana ke aapko 24-48 ghante mein proof bhejenge. "
        f"Logo/image file yahan WhatsApp par bhej dein. 🎨"
    )
    await client.send_text(phone, confirmation)

    return HTMLResponse(content=_form_success_html(customer_name=data.get("shop_name", "")))


def _design_form_html(phone: str, product: str, customer_name: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rareprint – Design Matter Form</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Segoe UI', sans-serif; background: #f0f4f8; min-height: 100vh; padding: 20px; }}
  .card {{ max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); overflow: hidden; }}
  .header {{ background: #075e54; color: white; padding: 20px; text-align: center; }}
  .header h1 {{ font-size: 20px; margin-bottom: 4px; }}
  .header p {{ font-size: 13px; opacity: 0.85; }}
  .body {{ padding: 24px; }}
  label {{ display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px; margin-top: 16px; }}
  label span {{ color: #e53e3e; }}
  input, textarea, select {{ width: 100%; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; outline: none; transition: border 0.2s; }}
  input:focus, textarea:focus {{ border-color: #075e54; }}
  textarea {{ resize: vertical; min-height: 80px; }}
  .hint {{ font-size: 11px; color: #888; margin-top: 4px; }}
  .submit-btn {{ width: 100%; margin-top: 24px; padding: 14px; background: #25d366; border: none; border-radius: 10px; color: white; font-size: 16px; font-weight: 700; cursor: pointer; letter-spacing: 0.3px; }}
  .submit-btn:hover {{ background: #1da851; }}
  .footer {{ text-align: center; padding: 16px; font-size: 12px; color: #aaa; }}
  .badge {{ display: inline-block; background: #e8f5e9; color: #2e7d32; font-size: 11px; padding: 3px 10px; border-radius: 20px; margin-top: 6px; }}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>🖨️ Rareprint</h1>
    <p>Design Matter Form</p>
    <div class="badge">📦 {product}</div>
  </div>
  <div class="body">
    <p style="font-size:13px;color:#555;margin-bottom:8px;">
      Neeche apni printing details bharein. Yeh information aapka design banane ke liye use hogi.
    </p>

    <form method="POST" action="/design/{phone}">
      <label>Shop / Doctor / Business Name <span>*</span></label>
      <input type="text" name="shop_name" required placeholder="e.g. Ravi Medical Store">

      <label>Full Address <span>*</span></label>
      <textarea name="address" required placeholder="Shop no., Street, Area, City, Pincode"></textarea>

      <label>Phone Number (to print on design) <span>*</span></label>
      <input type="tel" name="phone_on_design" placeholder="e.g. 9876543210">

      <label>Email (optional)</label>
      <input type="email" name="email" placeholder="yourname@email.com">

      <label>Tagline / Slogan (optional)</label>
      <input type="text" name="tagline" placeholder="e.g. 'Your Health, Our Priority'">

      <label>Services you offer (optional)</label>
      <input type="text" name="services" placeholder="e.g. Home delivery, Discounts, Doctor tie-up">

      <label>Any specific text or instruction</label>
      <textarea name="instructions" placeholder="Font preference, color, any special text..."></textarea>

      <label>Logo / Image</label>
      <p class="hint">⚠️ Please send your logo directly on WhatsApp after submitting this form (PDF, PNG, JPG, AI, CDR).</p>
      <input type="text" name="logo_note" placeholder="Logo available? Yes/No/Will send on WhatsApp">

      <button type="submit" class="submit-btn">✅ Submit Design Matter</button>
    </form>
  </div>
  <div class="footer">Rareprint · Chandrapur, Maharashtra · www.rareprint.in</div>
</div>
</body>
</html>"""


def _form_success_html(customer_name: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Submitted – Rareprint</title>
<style>
  body {{ font-family: 'Segoe UI', sans-serif; background: #f0f4f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }}
  .card {{ max-width: 400px; background: white; border-radius: 16px; padding: 40px 30px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }}
  .icon {{ font-size: 56px; margin-bottom: 16px; }}
  h2 {{ color: #075e54; margin-bottom: 10px; }}
  p {{ color: #555; font-size: 14px; line-height: 1.6; }}
  .btn {{ display: inline-block; margin-top: 20px; background: #25d366; color: white; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; }}
</style>
</head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <h2>Form Submitted!</h2>
  <p>{"Shukriya " + customer_name + "!" if customer_name else "Thank you!"}<br><br>
  Aapka design matter mil gaya. Hum 24-48 ghante mein design proof bhejenge WhatsApp par.<br><br>
  <strong>Logo file WhatsApp par bhejein.</strong></p>
  <a class="btn" href="https://wa.me/919699349563">📱 Open WhatsApp</a>
</div>
</body>
</html>"""


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

    project_id = "67727bb67127df0c20798c5d"

    # Base payload — try against MULTIPLE endpoint paths
    payload = {
        "apiKey":         api_key,
        "phone_number":   phone,
        "message_content": {"text": msg},
    }

    # Also try campaign API (known documented endpoint)
    campaign_payload = {
        "apiKey":         api_key,
        "campaignName":   os.getenv("AISENSY_CAMPAIGN_TEXT", "RAREPRINT_REPLY"),
        "destination":    phone,
        "userName":       "Test",
        "source":         "chatbot",
        "templateParams": [msg],
        "media":          {},
    }

    username  = os.getenv("AISENSY_USERNAME", "RAREPRINT3")
    client_id = "6226f90501a5c967a00b04d4"

    # e5/e6 need "shop" — try all possible shop values
    shop_variants = {
        "shop_project_id":  {**payload, "shop": project_id},
        "shop_username":    {**payload, "shop": username},
        "shop_client_id":   {**payload, "shop": client_id},
        "shop_lower":       {**payload, "shop": username.lower()},
    }

    correct_url = f"https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages"
    base_payload = {
        "phone_number": phone,
        "message_content": {"text": msg},
    }

    auth_variants = {
        "auth1_bearer":      {"Authorization": f"Bearer {api_key}"},
        "auth2_no_prefix":   {"Authorization": api_key},
        "auth3_x_api_key":   {"x-api-key": api_key},
        "auth4_apikey":      {"apikey": api_key},
        "auth5_token":       {"token": api_key},
        "auth6_in_body":     {},   # key in body only
        "auth7_x_auth":      {"x-auth-token": api_key},
    }

    results = {}
    for name, headers in auth_variants.items():
        try:
            headers["Content-Type"] = "application/json"
            p = {**base_payload}
         