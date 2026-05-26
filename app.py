from flask import Flask, request, jsonify
import os, requests, traceback, sqlite3, time
from google import genai
from collections import OrderedDict

app = Flask(__name__)

GEMINI_API_KEY  = os.environ.get("GEMINI_API_KEY", "")
AISENSY_API_KEY = os.environ.get("AISENSY_API_KEY", "")
CRM_WEBHOOK_URL = os.environ.get("CRM_WEBHOOK_URL", "")

# ─────────────────────────────────────────────
#  TEST MODE
#  Set TEST_MODE = "on" in Replit Secrets to enable.
#  Add your phone number(s) to TEST_PHONES (with country code, no + or spaces).
#  Only these numbers will get AI replies — all others are silently ignored.
#  Set TEST_MODE = "off" (or delete the secret) to go fully live.
# ─────────────────────────────────────────────
TEST_MODE   = os.environ.get("TEST_MODE", "on").lower().strip()
TEST_PHONES = [
    p.strip()
    for p in os.environ.get("TEST_PHONES", "").split(",")
    if p.strip()
]

# ─────────────────────────────────────────────
#  CAMPAIGN NAMES
#  Create each of these in AiSensy → Campaigns → API Campaign
# ─────────────────────────────────────────────

# General AI text reply: template body = {{1}} only, NO extra text, NO buttons
TEXT_CAMPAIGN = os.environ.get("TEXT_CAMPAIGN", "priya_reply")

# Product-specific catalog campaigns (image header + rate list in body)
# Map the exact button title text from your "question" campaign to a campaign name
PRODUCT_CAMPAIGNS = {
    # Key = text the customer sends (button title or keyword)
    # Value = AiSensy campaign name that shows the product photo + rate list
    "STICKER":         os.environ.get("CAMP_STICKER",    "sticker_catalog"),
    "DR. FILE":        os.environ.get("CAMP_DRFILE",     "drfile_catalog"),
    "WEBSITE":         os.environ.get("CAMP_WEBSITE",    ""),   # leave blank to skip
    "pouch":           os.environ.get("CAMP_POUCH",      "pouch_catalog"),
    "letterhead":      os.environ.get("CAMP_LHEAD",      "letterhead_catalog"),
    "pamphlet":        os.environ.get("CAMP_PAMPHLET",   "pamphlet_catalog"),
    "envelope":        os.environ.get("CAMP_ENVELOPE",   "envelope_catalog"),
    "bag":             os.environ.get("CAMP_BAG",        "bag_catalog"),
    "visiting card":   os.environ.get("CAMP_VCARD",      "vcard_catalog"),
}

# ─────────────────────────────────────────────
#  LANGUAGE DETECTION
#  Checks the Unicode script of the message to enforce correct reply language
# ─────────────────────────────────────────────
def detect_language(text):
    """
    Returns 'English', 'Hindi', or 'Marathi' based on the script used.
    Devanagari characters (U+0900–U+097F) = Hindi/Marathi.
    Latin characters = English.
    """
    devanagari = sum(1 for c in text if 'ऀ' <= c <= 'ॿ')
    latin      = sum(1 for c in text if c.isalpha() and ord(c) < 128)
    total      = devanagari + latin
    if total == 0:
        return "English"
    if devanagari / total > 0.3:
        return "Hindi or Marathi (Devanagari)"
    return "English"

# ─────────────────────────────────────────────
#  DEDUPLICATION
#  AiSensy fires the webhook twice for some messages — this prevents double replies
# ─────────────────────────────────────────────
_seen_ids = OrderedDict()

def already_seen(msg_id):
    if not msg_id:
        return False
    if msg_id in _seen_ids:
        print(f"[DEDUP] Skipping duplicate: {msg_id}")
        return True
    _seen_ids[msg_id] = 1
    if len(_seen_ids) > 500:
        _seen_ids.popitem(last=False)
    return False

# ─────────────────────────────────────────────
#  CONVERSATION MEMORY (SQLite)
# ─────────────────────────────────────────────
DB = "/tmp/rareprint.db"

def init_db():
    with sqlite3.connect(DB) as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS conv (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT, role TEXT, msg TEXT, ts INTEGER
            )
        """)
init_db()

def get_history(phone, limit=10):
    with sqlite3.connect(DB) as c:
        rows = c.execute(
            "SELECT role, msg FROM conv WHERE phone=? ORDER BY ts DESC LIMIT ?",
            (phone, limit)
        ).fetchall()
    return list(reversed(rows))

def save_turn(phone, role, msg):
    with sqlite3.connect(DB) as c:
        c.execute(
            "INSERT INTO conv (phone, role, msg, ts) VALUES (?,?,?,?)",
            (phone, role, msg[:3000], int(time.time()))
        )
        c.execute("""
            DELETE FROM conv WHERE phone=? AND id NOT IN (
                SELECT id FROM conv WHERE phone=? ORDER BY ts DESC LIMIT 30
            )
        """, (phone, phone))

# ─────────────────────────────────────────────
#  SYSTEM PROMPT
# ─────────────────────────────────────────────
SYSTEM_PROMPT = """You are Priya, a friendly WhatsApp sales agent for RarePrint — a printing company in Chandrapur, Maharashtra.

*** CRITICAL LANGUAGE RULE ***
The customer's language will be stated at the start of the prompt as [LANGUAGE: English] or [LANGUAGE: Hindi or Marathi].
- If [LANGUAGE: English] → you MUST reply in English only. Never switch to Hindi or Marathi.
- If [LANGUAGE: Hindi or Marathi] → reply in Hindi or Marathi (whichever they used).
DO NOT mix languages. Match the customer exactly.

LENGTH: Keep replies SHORT — 2 to 4 sentences only.

PRODUCTS & EXACT PRICES (give the exact price for the quantity asked, never a range):
• Letterhead 8.5×11 Inch (70GSM):  5000=₹5400  | 10000=₹9500   | 20000=₹17500
• Medicine Pouch Small 4×5 Inch:   5000=₹4999  | 10000=₹7999★  | 20000=₹13499 | 50000=₹31999
• Medicine Pouch Medium 4×7 Inch:  5000=₹5499  | 10000=₹8999   | 20000=₹15999
• Medicine Pouch Large 5.5×8 Inch: 5000=₹6999  | 10000=₹11499  | 20000=₹19999
• Pamphlet / Leaflet:               5000=₹2400  | 10000=₹4500   | 20000=₹8000
• Envelope:                         5000=₹2450  | 10000=₹4500   | 20000=₹8500
• Stickers:                         5000=₹999   | 10000=₹1799   | 20000=₹3199
• Non-Woven Bag:                    5000=₹4900  | 10000=₹9200   | 20000=₹17500
• Visiting Card, Doctor File, X-Ray Bag, Bill Book — available, price on request (ask quantity first)

BUSINESS RULES:
- Minimum order is 5000 pcs. If customer says 1000 / 2000 / 3000, politely say MOQ is 5000 and give the 5000 price.
- 50% advance payment | Delivery 10–25 days | GST included | PAN India delivery
- Contact: 96373 18960 | rareprint.in

SALES FLOW:
1. Greet warmly as Priya from RarePrint
2. Ask WHICH product they need
3. Ask QUANTITY
4. Give EXACT price for that quantity immediately
5. Mention "10000 pcs is the best value" where relevant
6. Once interested, ask for their name and city to proceed with order
"""

def build_prompt(language, history, user_text):
    prompt = f"[LANGUAGE: {language}]\n\n" + SYSTEM_PROMPT
    if history:
        prompt += "\n\n[Previous conversation]\n"
        for role, msg in history:
            label = "Customer" if role == "user" else "Priya"
            prompt += f"{label}: {msg}\n"
    prompt += f"\nCustomer: {user_text}\nPriya:"
    return prompt

# ─────────────────────────────────────────────
#  PRODUCT BUTTON / KEYWORD DETECTION
#  Maps what the customer says to a specific product catalog campaign
# ─────────────────────────────────────────────
def get_product_campaign(text):
    """
    If the message exactly matches a button title or contains a product keyword,
    return the campaign name for that product's catalog (photo + rate list).
    Returns None if no match.
    """
    t = text.strip()

    # Exact button title matches (from your "question" template buttons)
    exact_map = {
        "STICKER":    "STICKER",
        "DR. FILE":   "DR. FILE",
        "DR FILE":    "DR. FILE",
        "DOCTOR FILE":"DR. FILE",
    }
    for key, mapped in exact_map.items():
        if t.upper() == key:
            camp = PRODUCT_CAMPAIGNS.get(mapped, "")
            if camp:
                return camp

    # Keyword-based product detection (for typed messages)
    t_lower = t.lower()
    keyword_map = [
        (["sticker", "stickers", "label"],                          "STICKER"),
        (["doctor file", "dr file", "dr.", "drfile"],               "DR. FILE"),
        (["pouch", "medicine bag", "davai ki theli", "4x5", "4x7"], "pouch"),
        (["letterhead", "letter head"],                             "letterhead"),
        (["pamphlet", "leaflet", "flyer"],                          "pamphlet"),
        (["envelope", "lifafa"],                                    "envelope"),
        (["non woven", "non-woven bag", "nonwoven"],                "bag"),
        (["visiting card", "business card", "namecard"],            "visiting card"),
    ]
    for keywords, product_key in keyword_map:
        if any(kw in t_lower for kw in keywords):
            camp = PRODUCT_CAMPAIGNS.get(product_key, "")
            if camp:
                return camp

    return None

# ─────────────────────────────────────────────
#  AISENSY SEND FUNCTIONS
# ─────────────────────────────────────────────
AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2"

def send_campaign(phone, campaign_name, params=None, customer_name="Customer"):
    """
    Generic AiSensy campaign sender.
    params = list of template variable values (e.g. [reply_text])
    """
    payload = {
        "apiKey":         AISENSY_API_KEY,
        "campaignName":   campaign_name,
        "destination":    phone,
        "userName":       customer_name,
        "source":         "AI Chatbot",
        "templateParams": params or []
    }
    try:
        r = requests.post(AISENSY_URL, json=payload, timeout=10)
        print(f"[SEND '{campaign_name}'] {r.status_code} → {r.text[:300]}")
        return r.status_code == 200
    except Exception as e:
        print(f"[SEND ERROR '{campaign_name}'] {e}")
        return False

def forward_to_crm(payload):
    if not CRM_WEBHOOK_URL:
        return
    try:
        r = requests.post(CRM_WEBHOOK_URL, json=payload, timeout=5)
        print(f"[CRM FORWARD] {r.status_code} → {r.text[:200]}")
    except Exception as e:
        print(f"[CRM FORWARD ERROR] {e}")

# ─────────────────────────────────────────────
#  WEBHOOK
# ─────────────────────────────────────────────
@app.route("/webhook", methods=["POST"])
def webhook():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "ok"}), 200

        msg         = data.get("data", {}).get("message", {})
        phone       = msg.get("phone_number", "")
        sender      = msg.get("sender", "")
        msg_type    = msg.get("message_type", "TEXT")
        msg_content = msg.get("message_content", {})
        msg_id      = msg.get("id", "") or msg.get("message_id", "")

        print(f"[IN] phone={phone} sender={sender} type={msg_type} id={msg_id}")

        # Only process incoming customer messages
        if sender != "USER":
            print(f"[SKIP] sender={sender}")
            return jsonify({"status": "ok"}), 200

        forward_to_crm(data)

        # ── TEST MODE — only reply to whitelisted numbers ──
        if TEST_MODE == "on":
            if not TEST_PHONES:
                print("[TEST MODE] ON but TEST_PHONES is empty — blocking all replies. Add your number to TEST_PHONES secret.")
                return jsonify({"status": "ok"}), 200
            # Normalize: strip leading + or 0, compare last 10 digits
            def normalize(n):
                return n.lstrip("+").lstrip("0")
            if not any(normalize(phone).endswith(normalize(tp)) for tp in TEST_PHONES):
                print(f"[TEST MODE] Blocked {phone} — not in whitelist")
                return jsonify({"status": "ok"}), 200
            print(f"[TEST MODE] Allowed {phone} ✅")

        # Deduplication
        if already_seen(msg_id):
            return jsonify({"status": "ok"}), 200

        # ── Extract text ──
        if msg_type == "TEXT":
            user_text = msg_content.get("text", "")

        elif msg_type == "INTERACTIVE":
            # Customer clicked a button or list item
            interactive = msg_content.get("interactive", {})
            btn = interactive.get("button_reply", {}) or interactive.get("list_reply", {})
            user_text = btn.get("title", "") or msg_content.get("text", "") or "button"

        elif msg_type == "IMAGE":
            user_text = msg_content.get("caption", "") or "Customer sent an image"

        elif msg_type == "DOCUMENT":
            user_text = msg_content.get("caption", "") or "Customer sent a document"

        elif msg_type == "AUDIO":
            user_text = "Customer sent a voice message"

        else:
            user_text = msg_content.get("text", "") or f"Customer sent a {msg_type} message"

        print(f"[TEXT] {user_text[:200]}")

        if not phone or not user_text:
            return jsonify({"status": "ok"}), 200

        # ── Check if this is a product button click → send catalog template ──
        product_camp = get_product_campaign(user_text)
        if product_camp:
            print(f"[PRODUCT] Sending catalog campaign '{product_camp}' to {phone}")
            send_campaign(phone, product_camp)
            save_turn(phone, "user", user_text)
            save_turn(phone, "bot", f"[Sent product catalog: {product_camp}]")
            return jsonify({"status": "ok"}), 200

        # ── Detect language for correct AI reply ──
        language = detect_language(user_text)
        print(f"[LANG] Detected: {language}")

        # ── Load conversation history ──
        history = get_history(phone)
        save_turn(phone, "user", user_text)

        # ── Generate Gemini reply ──
        try:
            client   = genai.Client(api_key=GEMINI_API_KEY)
            prompt   = build_prompt(language, history, user_text)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            reply = response.text.strip()
            print(f"[GEMINI] [{language}] {reply[:300]}")
        except Exception as e:
            print(f"[GEMINI ERROR] {e}")
            if language == "English":
                reply = "Hi! I'm Priya from RarePrint. Which product are you looking for? Call: 96373 18960"
            else:
                reply = "Namaste! Main Priya hun RarePrint se. Aap kaunsa product chahte hain? Call: 96373 18960"

        save_turn(phone, "bot", reply)

        # ── Send the AI text reply ──
        send_campaign(phone, TEXT_CAMPAIGN, params=[reply])

        return jsonify({"status": "ok"}), 200

    except Exception as e:
        print(f"[FATAL] {e}")
        print(traceback.format_exc())
        return jsonify({"status": "ok"}), 200


@app.route("/", methods=["GET"])
def home():
    mode = f"🔒 TEST MODE — only {TEST_PHONES}" if TEST_MODE == "on" else "🟢 LIVE — replying to everyone"
    return f"RarePrint AI Agent v11 — Priya is online | {mode}", 200


@app.route("/test", methods=["GET"])
def test():
    gemini  = "✅" if GEMINI_API_KEY  else "❌ MISSING — add to Secrets"
    aisensy = "✅" if AISENSY_API_KEY else "❌ MISSING — add to Secrets"
    configured = [k for k, v in PRODUCT_CAMPAIGNS.items() if v]
    mode_status = (
        f"🔒 TEST MODE ON — allowed numbers: {TEST_PHONES or 'NONE (add TEST_PHONES secret)'}"
        if TEST_MODE == "on"
        else "🟢 LIVE MODE — replying to ALL customers"
    )
    return (
        f"RarePrint AI v11\n"
        f"Gemini key:      {gemini}\n"
        f"AiSensy key:     {aisensy}\n"
        f"Text campaign:   {TEXT_CAMPAIGN}\n"
        f"Product campaigns configured: {configured}\n\n"
        f"Mode: {mode_status}\n"
        f"To go LIVE: set TEST_MODE = off  in Replit Secrets\n"
        f"To test:    set TEST_MODE = on   and TEST_PHONES = 91XXXXXXXXXX\n"
    ), 200


@app.route("/history/<phone>", methods=["GET"])
def show_history(phone):
    rows = get_history(phone, limit=20)
    lines = [f"{role.upper()}: {msg}" for role, msg in rows]
    return "\n\n".join(lines) or "No history found", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
