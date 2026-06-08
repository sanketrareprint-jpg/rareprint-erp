"""
Automated chatbot regression tests.
Run: python test_bot.py
Tests every product keyword, quantity format, button, and edge case.
"""
import sys, asyncio, json
sys.path.insert(0, ".")

from unittest.mock import AsyncMock, MagicMock, patch
from conversation_store import ConversationStore
from ai_agent import SalesAgent

PASS = 0; FAIL = 0

def ok(name):
    global PASS; PASS += 1
    print(f"  ✅ {name}")

def fail(name, detail=""):
    global FAIL; FAIL += 1
    print(f"  ❌ {name}" + (f" → {detail}" if detail else ""))

# ── Mock AiSensy client ──────────────────────────────────────────
class FakeClient:
    def __init__(self):
        self.sent = []
    async def send_text(self, phone, text):
        self.sent.append({"type":"text","content":text})
    async def send_buttons(self, phone, text, buttons):
        self.sent.append({"type":"buttons","content":text,"buttons":buttons})
    async def send_image(self, phone, url, caption=""):
        self.sent.append({"type":"image","url":url,"caption":caption})
    async def send_video(self, phone, url, caption=""):
        self.sent.append({"type":"video","url":url,"caption":caption})
    async def send_document(self, phone, url, filename, caption=""):
        self.sent.append({"type":"document"})
    async def send_carousel(self, phone, cards):
        self.sent.append({"type":"carousel","cards":cards})
    async def send_product_template(self, phone, product):
        self.sent.append({"type":"template","product":product["name"]})
    async def send_payment_link(self, phone, product):
        self.sent.append({"type":"payment_link","product":product["name"]})
    def reset(self):
        self.sent = []
    def all_text(self):
        return " | ".join(m.get("content","") + m.get("caption","") for m in self.sent)
    def has_template(self):
        return any(m["type"] == "template" for m in self.sent)
    def template_name(self):
        for m in self.sent:
            if m["type"] == "template": return m["product"]
        return ""

def make_msg(text, phone="919000000001", name="TestUser"):
    return {"phone": phone, "name": name, "text": text,
            "message_id": f"msg_{hash(text)}", "media_type": ""}

async def send(agent, client, text, phone="919000000001"):
    client.reset()
    with patch.object(agent, "_get_ai_reply", return_value=""):
        await agent.handle_message(make_msg(text, phone=phone))
    return client

# ── TESTS ────────────────────────────────────────────────────────
async def run_tests():
    store = ConversationStore()
    client = FakeClient()
    agent = SalesAgent(store, client)

    print("\n══ 1. PRODUCT KEYWORD DETECTION ══")
    products_to_test = [
        ("medicine pouch", "size"),   # bot correctly asks size first
        ("pouch", "size"),              # bot correctly asks size first
        ("KEYCHAIN", "Keychain"),
        ("keychain", "Keychain"),
        ("pen ", "Pen"),
        ("visiting card", "Visiting"),
        ("bill book", "Bill"),
        ("letterpad", "Letterpad"),
        ("prescription sticker", "Sticker"),
        ("carry bag", None),   # carry bag / non-woven
        ("envelope", "Envelope"),
        ("pamphlet", "Leaflet"),
        ("dr file", "File"),
    ]
    for keyword, expect_substr in products_to_test:
        phone = f"91900{abs(hash(keyword))%10000000:07d}"
        c = await send(agent, client, keyword, phone=phone)
        combined = c.all_text() + c.template_name()
        if expect_substr and expect_substr.lower() in combined.lower():
            ok(f"'{keyword}' → product detected")
        elif expect_substr is None and len(c.sent) > 0:
            ok(f"'{keyword}' → got some response")
        elif expect_substr:
            fail(f"'{keyword}' → expected '{expect_substr}' in response", combined[:80])

    print("\n══ 2. PHONE NUMBER NOT LEAKED ══")
    import os
    biz_phone = os.getenv("BUSINESS_PHONE", "9699349563").replace("+91","").replace(" ","")
    for keyword in ["keychain", "hello", "hi", "call me", "bat kriye phone pe"]:
        phone = f"91901{abs(hash(keyword))%10000000:07d}"
        c = await send(agent, client, keyword, phone=phone)
        all_text = c.all_text()
        if biz_phone in all_text.replace(" ","").replace("+",""):
            fail(f"Phone leaked on '{keyword}'", all_text[:100])
        else:
            ok(f"Phone NOT leaked on '{keyword}'")

    print("\n══ 3. QUANTITY EXTRACTION ══")
    from ai_agent import SalesAgent as SA
    tmp = SA.__new__(SA)
    qty_cases = [
        ("5000", 5000),
        ("5,000 pcs", 5000),
        ("5000 pcs", 5000),
        ("10k", 10000),
        ("10,000", 10000),
        ("1 lakh", 100000),
        ("paanch hazaar", 5000),
        ("das hazaar", 10000),
        ("bees hazaar", 20000),
        ("20 pads", 20),
        ("500 pieces", 500),
        ("2k", 2000),
        ("hello", None),
        ("ok", None),
    ]
    for text, expected in qty_cases:
        result = tmp._extract_qty_from_text(text)
        if result == expected:
            ok(f"qty('{text}') = {expected}")
        else:
            fail(f"qty('{text}')", f"expected {expected} got {result}")

    print("\n══ 4. QUANTITY BLEED (product change resets qty) ══")
    phone = "919020000001"
    store.update_lead(phone, product="Medicine Pouch – Small Size", quantity="5000")
    store.set_state(phone, "product_sent")
    c = await send(agent, client, "letterpad", phone=phone)
    qty_after = store.get_lead(phone).get("quantity","")
    if qty_after in ("", None, "0"):
        ok("Old qty cleared when product changes")
    else:
        fail("Old qty NOT cleared when product changes", f"qty={qty_after}")

    print("\n══ 5. BUTTON HANDLERS ══")
    button_cases = [
        ("Place Order 🛒", "Place Order"),
        ("place order", "Place Order"),
        ("Need More Info", "Need More Info"),
        ("See Other Products", "See Other Products"),
        ("call me", "Call handler"),
        ("bat kriye phone pe", "Call handler (Hinglish)"),
        ("video pe konsa size", "Video handler"),
    ]
    for btn_text, label in button_cases:
        phone = f"91903{abs(hash(btn_text))%10000000:07d}"
        c = await send(agent, client, btn_text, phone=phone)
        if len(c.sent) > 0:
            ok(f"'{btn_text}' → got response")
        else:
            fail(f"'{btn_text}' → NO response", label)

    print("\n══ 6. CONFIRMATION WORDS → payment link (when product+qty known) ══")
    confirm_words = ["haan", "bilkul", "theek hai", "kar do", "chalega", "yes, confirm ✅"]
    for word in confirm_words:
        phone = f"91904{abs(hash(word))%10000000:07d}"
        store.update_lead(phone, product="Medicine Pouch – Small Size", quantity="5000")
        from products import PRODUCTS
        store.set_state(phone, "product_sent")
        c = await send(agent, client, word, phone=phone)
        has_payment = any(m["type"] in ("payment_link","buttons") for m in c.sent)
        if has_payment or "token" in c.all_text().lower() or "₹500" in c.all_text():
            ok(f"'{word}' → moves toward payment")
        else:
            fail(f"'{word}' → no payment action", c.all_text()[:60])

    print("\n══ 7. SIZE CHANGE (letterpad A4 after A8) ══")
    phone = "919050000001"
    store.update_lead(phone, product="Multicolour Letterpad – A8 Size", quantity="5000")
    store.set_state(phone, "product_sent")
    c = await send(agent, client, "A4", phone=phone)
    new_prod = store.get_lead(phone).get("product","")
    new_qty  = store.get_lead(phone).get("quantity","")
    if "A4" in new_prod or "a4" in new_prod.lower():
        ok("A4 size change detected, product updated")
    else:
        fail("A4 size change NOT detected", f"product={new_prod}")
    if new_qty in ("","0",None):
        ok("Qty cleared on size change")
    else:
        fail("Qty NOT cleared on size change", f"qty={new_qty}")

    print("\n══ 8. DUPLICATE MESSAGE IGNORED ══")
    phone = "919060000001"
    msg = make_msg("hello", phone=phone)
    msg["message_id"] = "dup_msg_001"
    client.reset()
    with patch.object(agent, "_get_ai_reply", return_value="Hi there"):
        await agent.handle_message(msg)
    first_count = len(client.sent)
    client.reset()
    with patch.object(agent, "_get_ai_reply", return_value="Hi there"):
        await agent.handle_message(msg)  # same message_id
    if len(client.sent) == 0:
        ok("Duplicate message ignored")
    else:
        fail("Duplicate message NOT ignored")

    print("\n══ 9. CITY REJECT WORDS (not stored as city) ══")
    from ai_agent import SalesAgent as SA2
    tmp2 = SA2.__new__(SA2)
    tmp2.store = store
    tmp2.client = client

    bad_cities = ["theek hai", "ok", "haan", "baad mein", "nahi", "yes"]
    good_cities = ["Nagpur", "Mumbai", "Chandrapur", "Pune", "Delhi"]

    for city in bad_cities:
        phone = f"91907{abs(hash(city))%10000000:07d}"
        store.update_lead(phone)
        store2 = ConversationStore()
        store2.update_lead(phone, **{})
        # Simulate mark_question_asked("city") then try to capture
        store.mark_question_asked(phone, "city")
        tmp2._capture_answer_to_last_question(phone, city)
        stored = store.get_lead(phone).get("city","")
        if not stored:
            ok(f"Reject word '{city}' not stored as city")
        else:
            fail(f"'{city}' was stored as city!", stored)

    for city in good_cities:
        phone = f"91908{abs(hash(city))%10000000:07d}"
        store.mark_question_asked(phone, "city")
        tmp2._capture_answer_to_last_question(phone, city)
        stored = store.get_lead(phone).get("city","")
        if stored:
            ok(f"Valid city '{city}' stored correctly")
        else:
            fail(f"Valid city '{city}' NOT stored", "city field empty")

    # ── SUMMARY ──────────────────────────────────────────────────
    total = PASS + FAIL
    print(f"\n{'='*45}")
    print(f"Results: {PASS}/{total} passed  |  {FAIL} FAILED")
    print(f"{'='*45}\n")
    if FAIL:
        sys.exit(1)

asyncio.run(run_tests())
