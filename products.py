"""
Rareprint Product Catalog
══════════════════════════
Auto-generated from Dialogflow export — rareprintchatbot.zip
All 28 products with real media URLs, rates, and keywords.

To add/edit products: copy a block below and fill in the details.
"""

# ── Global Terms of Service (appended to every product) ───────────────────
GLOBAL_TOS = """📋 *Payment Terms*
> 50% advance before printing, 50% before dispatch
> 50% COD Available
> UPI / PhonePe / GPay / Paytm / NEFT / Cash accepted

📞 *Contact Rareprint*
Call/WhatsApp: +91 9699349563 | +91 7020592482
Email: sanket.rareprint@gmail.com
Web: www.rareprint.in""".strip()

# ── Payment Details ────────────────────────────────────────────────────────
PAYMENT_DETAILS = """💳 *Payment Details*

PhonePe / UPI: 8766661980
UPI ID: prajakta.rareprint@oksbi

🏦 *Bank Transfer:*
Bank: IDBI BANK | Branch: Chandrapur (MH.)
A/C Name: RAREPRINT IN
A/C No.: 0513102000013378
IFSC: IBKL0000513

_Please send payment screenshot after transfer._"""

# ── Company Info ───────────────────────────────────────────────────────────
COMPANY_ADDRESS = "T401, Tirupati Home Apartment-3, Fourth Floor, Behind Manwatkar Hospital, Chandrapur - 442401, Maharashtra"
COMPANY_PHONES  = ["+91 9699349563", "+91 7020592482", "+91 9309486186"]
COMPANY_WEBSITE = "https://www.rareprint.in"

# ── MOQ Reference ─────────────────────────────────────────────────────────
MOQ_LIST = """*MINIMUM ORDER QUANTITIES*
• Pouches / Stickers: 5,000 pcs
• Visiting Cards: 2,000 pcs
• Keychains: 500 pcs (PVC 1000, Silicon 2000)
• Letterpad/Billbook A8: 20 pads | A4: 10 pads
• Dr Files: 1,000 pcs
• Leaflet/Pamphlet: 1,000 pcs
• Carry bags (single color): 500 pcs | (multicolor): 2,000 pcs
• Mobile Stand / Paper Weight / Pen Stand: 500 pcs
• Pen: 1,000 pcs"""

# ══════════════════════════════════════════════════════════════════════════
# PRODUCT CATALOG
# ══════════════════════════════════════════════════════════════════════════
PRODUCTS: dict[str, dict] = {

    # ── MEDICINE POUCHES ──────────────────────────────────────────────────

    "pouch_small": {
        "name": "Medicine Pouch – Small Size",
        "keywords": ["small pouch", "small medicine pouch", "pouch small", "chota pouch",
                     "4x5 pouch", "4\"x5\"", "medicine pouch", "pouch", "lifafa", "small"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2269919_SMALL MEDICINE POUCH.mp4",
        "photo_url": "",
        "rates": """*💊 MEDICINE POUCH – SMALL SIZE*

*Dimensions:* 4" × 5" inches
*Paper Quality:* 70 GSM
*Minimum Order Quantity (MOQ):* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹4,999/-
• 10,000 pcs – ₹7,999/-
• 20,000 pcs – ₹13,499/-
• 50,000 pcs – ₹31,999/-
• 1,00,000 pcs – ₹55,499/-

_📦 Courier Charges Extra_
_💳 50% COD Available_
🌐 https://rareprint.in/product/medicine-pouch/""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Small 4×5 inch multicolor printed medicine pouches, MOQ 5000 pcs",
    },

    "pouch_medium": {
        "name": "Medicine Pouch – Medium Size",
        "keywords": ["medium pouch", "medium medicine pouch", "4x7 pouch", "4*7",
                     "mediumpouch", "medium", "4-7"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/8040230_MEDIUM MEDICINE POUCH.mp4",
        "photo_url": "",
        "rates": """*💊 MEDICINE POUCH – MEDIUM SIZE*

*Dimensions:* 4" × 7" inches
*Paper Quality:* 70 GSM
*Minimum Order Quantity:* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹5,499/-
• 10,000 pcs – ₹9,499/-
• 20,000 pcs – ₹16,499/-
• 50,000 pcs – ₹38,499/-
• 1,00,000 pcs – ₹69,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_
🌐 https://rareprint.in/product/medicine-pouch/""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Medium 4×7 inch multicolor printed medicine pouches",
    },

    "pouch_large": {
        "name": "Medicine Pouch – Large Size",
        "keywords": ["large pouch", "large medicine pouch", "5.5x8 pouch", "5.5\"×8\"",
                     "largepouch", "large"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/4715253_LARGE MEDICINE POUCH.mp4",
        "photo_url": "",
        "rates": """*💊 MEDICINE POUCH – LARGE SIZE*

*Dimensions:* 5.5" × 8" inches
*Paper Quality:* 70 GSM
*Minimum Order Quantity (MOQ):* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹6,999/-
• 10,000 pcs – ₹12,499/-
• 20,000 pcs – ₹21,499/-
• 50,000 pcs – ₹51,499/-
• 1,00,000 pcs – ₹88,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_
🌐 https://rareprint.in/product/medicine-pouch/""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Large 5.5×8 inch multicolor printed medicine pouches",
    },

    "pouch_extralarge": {
        "name": "Medicine Pouch – Extra Large Size",
        "keywords": ["extra large pouch", "xl pouch", "8.5x11 pouch", "8.5\"×11\"",
                     "extralarge", "extra large", "xl medicine pouch"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/3230219_EXTRA LARGE MEDICINE POUCH.mp4",
        "photo_url": "",
        "rates": """*💊 MEDICINE POUCH – EXTRA LARGE SIZE*

*Dimensions:* 8.5" × 11" inches
*Paper Quality:* 70 GSM
*Minimum Order Quantity (MOQ):* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹13,499/-
• 10,000 pcs – ₹24,499/-
• 20,000 pcs – ₹43,499/-
• 50,000 pcs – ₹1,04,999/-
• 1,00,000 pcs – ₹1,79,499/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Extra large 8.5×11 inch multicolor printed medicine pouches",
    },

    # ── VISITING CARDS ────────────────────────────────────────────────────

    "visiting_card_350gsm": {
        "name": "Visiting Cards – 350 GSM",
        "keywords": ["visiting card", "visiting cards", "business card", "name card",
                     "350 gsm visiting card", "350 gsm cards", "visiting card 350 gsm",
                     "vc", "card printing"],
        "media_type": "image",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/1767945_WhatsAppImage20250924at6.29.55AM1..jpg",
        "photo_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/1767945_WhatsAppImage20250924at6.29.55AM1..jpg",
        "rates": """*💊 VISITING CARDS – 350 GSM*

*Dimensions:* 3.5" × 2" inches (Standard)
*Paper Quality:* 350 GSM
*Minimum Order Quantity:* 2,000 cards

*💰 Price List:*
• 2,000 pcs – ₹1,499/-
• 5,000 pcs – ₹2,999/-
• 10,000 pcs – ₹4,999/-
• 20,000 pcs – ₹8,499/-

_📦 Courier Charges Extra_
_💳 50% COD Available_
🌐 https://rareprint.in""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Premium 350 GSM visiting cards with multicolor printing",
    },

    "visiting_card_classic": {
        "name": "Classic Visiting Cards – 250 & 300 GSM",
        "keywords": ["classic visiting card", "250 gsm visiting card", "300 gsm visiting card",
                     "classic card", "250 gsm cards", "300 gsm cards"],
        "media_type": "image",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/625626_VisitingCardscaled..jpg",
        "photo_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/625626_VisitingCardscaled..jpg",
        "rates": """*💊 CLASSIC VISITING CARDS – 250 & 300 GSM*

*Dimensions:* 3.5" × 2" inches
*Paper Quality:* 250 / 300 GSM
*Minimum Order Quantity:* 2,000 cards

*💰 Price List:*
• 2,000 pcs – ₹1,199/-
• 5,000 pcs – ₹2,499/-
• 10,000 pcs – ₹3,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_
🌐 https://rareprint.in""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Classic visiting cards in 250 & 300 GSM",
    },

    "visiting_card_shaped": {
        "name": "Shaped Visiting Cards – 370 GSM",
        "keywords": ["shaped visiting card", "shaped card", "370 gsm visiting card",
                     "370 gsm cards", "die cut card", "shaped cards"],
        "media_type": "image",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/1908401_WhatsAppImage20250924at6.02.05AM..jpg",
        "photo_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/1908401_WhatsAppImage20250924at6.02.05AM..jpg",
        "rates": """*💊 SHAPED VISITING CARDS – 370 GSM*

Premium die-cut shaped cards for a unique brand impression.

*Paper Quality:* 370 GSM
*Minimum Order Quantity:* 2,000 pcs

*💰 Price List:*
• 2,000 pcs – ₹1,999/-
• 5,000 pcs – ₹3,999/-
• 10,000 pcs – ₹6,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Die-cut shaped visiting cards in 370 GSM",
    },

    "visiting_card_nontearable": {
        "name": "Non-Tearable Visiting Cards – 180 Micron",
        "keywords": ["non tearable visiting card", "non-tearable visiting card",
                     "180 micron visiting card", "waterproof card", "plastic card"],
        "media_type": "image",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/625626_VisitingCardscaled..jpg",
        "photo_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/625626_VisitingCardscaled..jpg",
        "rates": """*💊 NON-TEARABLE VISITING CARDS – 180 MICRON*

Tear-proof, waterproof PVC cards for long-lasting impression.

*Material:* 180 Micron PVC
*Minimum Order Quantity:* 2,000 pcs

*💰 Price List:*
• 2,000 pcs – ₹2,499/-
• 5,000 pcs – ₹4,999/-
• 10,000 pcs – ₹8,499/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Tear-proof non-tearable visiting cards in 180 micron PVC",
    },

    # ── BILL BOOKS ────────────────────────────────────────────────────────

    "billbook_multicolor_a4": {
        "name": "Multicolor Printed Bill Books – A4 Size",
        "keywords": ["bill book a4", "a4 bill book", "a4 size bill book",
                     "multicolor bill book a4", "invoice book a4", "bill book"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*💊 MULTICOLOR PRINTED BILL BOOKS – A4 SIZE*
_Fully customizable with your design, logo & details_

*Printing:* Multicolor, Single Side
*Dimensions:* A4 (8.5×11 Inch)
*Paper Quality:* 70 GSM
*50% COD Available | Shipping Extra*

*💰 Price List:*
• 10 pads – ₹3,800/-
• 20 pads – ₹7,000/-
• 45 pads – ₹9,900/-
• 90 pads – ₹17,000/-

_📦 Courier Charges Extra_
🌐 https://rareprint.in/product/custom-printed-bill-book-multicolor-printing-a4-size-best-for-invoicing-and-estimate-2/""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor A4 bill books / invoice books",
    },

    "billbook_multicolor_a8": {
        "name": "Multicolor Printed Bill Books – A8 Size",
        "keywords": ["bill book a8", "a8 bill book", "a8 size bill book",
                     "multicolor bill book a8", "small bill book"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*💊 MULTICOLOR PRINTED BILL BOOKS – A8 SIZE*
_Fully customizable with your design, logo & details_

*Printing:* Multicolor, Single Side
*Dimensions:* A8 (5.5×8.5 Inch)
*Paper Quality:* 70 GSM

*💰 Price List:*
• 20 pads – ₹3,800/-
• 45 pads – ₹5,850/-
• 90 pads – ₹9,900/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor A8 bill books",
    },

    "billbook_singlecolor_a8": {
        "name": "Single Color Bill Book – A8 Size",
        "keywords": ["single color bill book", "single colour bill book",
                     "a8 single color", "single color a8", "a8 bill book single color"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*💊 SINGLE COLOR PRINTED BILL BOOKS – A8 SIZE*

*Printing:* Single Color, Single Side
*Dimensions:* A8 (5.5×8.5 Inch)
*Paper Quality:* 70 GSM

*💰 Price List:*
• 20 pads – ₹2,200/-
• 45 pads – ₹3,500/-
• 90 pads – ₹5,800/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Single color A8 bill books",
    },

    # ── LETTERPADS ────────────────────────────────────────────────────────

    "letterpad_a4": {
        "name": "Multicolour Letterpad – A4 Size",
        "keywords": ["letterpad a4", "a4 letterpad", "prescription pad a4",
                     "pad a4", "multicolor a4", "8.5*11", "a4 pad", "letter pad a4"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/9971175_LETTERPAD.mp4",
        "photo_url": "",
        "rates": """🎯 *A4 LETTERPAD – PREMIUM QUALITY*

✨ Multicolor | Top Gum Binding | Professional Finish

📄 Size: A4 (8.27 × 11.69 Inch)
🖨️ Printing: Multicolor, Single Side
📑 Paper: 80 GSM | 100 GSM | 80 Bond | 100 Bond
⏱️ Time: 4–8 Working Days | 🚚 Shipping Extra

*💰 Rate List:*
• 10 pads – ₹3,800/-
• 20 pads – ₹7,000/-
• 45 pads – ₹9,900/-
• 90 pads – ₹17,000/-

_💳 50% COD Available_
🌐 https://rareprint.in""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor A4 prescription / letterpad with gum binding",
    },

    "letterpad_a8": {
        "name": "Multicolour Letterpad – A8 Size",
        "keywords": ["letterpad a8", "a8 letterpad", "prescription pad a8",
                     "pad a8", "multicolor a8", "5.5*8.5", "a8 pad", "parcha",
                     "prescription pad", "leterpad", "letterpad"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/9971175_LETTERPAD.mp4",
        "photo_url": "",
        "rates": """📝 *A8 LETTERPAD – MULTICOLOR PRINTING*

📄 Size: A8 (5.5 × 8.5 Inch)
🖨️ Printing: Multicolor, Single Side
📑 Paper: 80 GSM | 100 GSM | 80 Bond | 100 Bond
⏱️ 4–8 Working Days | 💵 COD Available | 🚚 Shipping Extra

*💰 Rate List:*
• 20 pads – ₹2,200/-
• 45 pads – ₹3,500/-
• 90 pads – ₹5,800/-
• 180 pads – ₹9,900/-

_📦 Courier Charges Extra_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor A8 prescription pad / letterpad",
    },

    "letterhead": {
        "name": "Letterhead",
        "keywords": ["letterhead", "letter head", "later hed", "letter hed",
                     "report pad", "company letterhead"],
        "media_type": "image",
        "media_url": "https://rareprint.in/wp-content/uploads/2025/06/Gemini_Generated_Image_awsjtbawsjtbawsj-1-416x416.png",
        "photo_url": "https://rareprint.in/wp-content/uploads/2025/06/Gemini_Generated_Image_awsjtbawsjtbawsj-1-416x416.png",
        "rates": """*💊 MULTICOLOR LETTERHEAD*

*Printing:* Multicolor
*Size:* A4 (8.5 × 11 Inch)
*Paper Quality:* 70 GSM / 80 GSM

*💰 Price List:*
• 500 pcs – ₹1,200/-
• 1,000 pcs – ₹1,800/-
• 2,000 pcs – ₹2,800/-
• 5,000 pcs – ₹5,500/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor company letterheads",
    },

    # ── DOCTOR FILES ──────────────────────────────────────────────────────

    "dr_file_art_card": {
        "name": "Doctor File – Art Card",
        "keywords": ["dr file art card", "doctor file art card", "art card file",
                     "dr. file art card", "medical file art card", "file art card"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/5679707_ALL FILES REEL.mp4",
        "photo_url": "",
        "rates": """🌟 *DOCTOR FILE – ART CARD (250/300/350 GSM)*

✨ Multicolor | Glossy Finish | 12×18 inch (Open)

📌 Features:
• Premium Art Card — Bright white both sides
• Glossy Lamination (Matt on request)
• Size: Open 12×18" | Closed 9×12"
• 4–8 Working Days | All Languages Supported

*💰 Price List:*
• 1,000 pcs – ₹8,499/-
• 2,000 pcs – ₹14,999/-
• 5,000 pcs – ₹30,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Doctor/clinic files in premium Art Card material",
    },

    "dr_file_duplex": {
        "name": "Doctor File – Duplex Card",
        "keywords": ["dr file duplex", "doctor file duplex", "duplex card file",
                     "dr. file duplex card", "duplex file", "duplex"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/5679707_ALL FILES REEL.mp4",
        "photo_url": "",
        "rates": """🌟 *DOCTOR FILE – DUPLEX CARD (250/300/350 GSM)*

✨ Multicolor | Glossy Finish | 12×18 inch (Open)

📌 Features:
• Duplex Card — Strong board, off-white inner side
• Glossy Lamination (Matt available on request)
• Size: Open 12×18" | Closed 9×12"

*💰 Price List:*
• 1,000 pcs – ₹7,499/-
• 2,000 pcs – ₹12,999/-
• 5,000 pcs – ₹27,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Doctor files in Duplex Card material",
    },

    "dr_file_fbb": {
        "name": "Doctor File – FBB Card",
        "keywords": ["dr file fbb", "doctor file fbb", "fbb card file",
                     "dr. file fbb card", "fbb file", "fbb"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/5679707_ALL FILES REEL.mp4",
        "photo_url": "",
        "rates": """🌟 *DOCTOR FILE – FBB CARD (250/300/350 GSM)*

✨ Multicolor | Glossy Finish | 12×18 inch (Open)

📌 Features:
• FBB (Food Grade Board) — Hard, stiff & premium
• Glossy Lamination (Matt available on request)
• Size: Open 12×18" | Closed 9×12"

*💰 Price List:*
• 1,000 pcs – ₹8,999/-
• 2,000 pcs – ₹15,999/-
• 5,000 pcs – ₹32,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Doctor files in premium FBB (Food Grade Board) material",
    },

    "dr_file_pvc": {
        "name": "Doctor File – PVC Card",
        "keywords": ["dr file pvc", "doctor file pvc", "pvc file",
                     "dr. file pvc card", "pvc card file", "pvc file rate",
                     "waterproof file"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/5679707_ALL FILES REEL.mp4",
        "photo_url": "",
        "rates": """🌟 *DOCTOR FILE – PVC CARD (Waterproof & Tear-Proof)*

📌 Features:
• PVC Material — Waterproof, tear-proof, long-lasting
• Executive: 300 Micron | Deluxe: 350 Micron
• Size (Executive): Open 12×18" | Closed 9×12"
• Size (Deluxe): Open 12.2×19" | Closed 9.5×12.2"

*💰 Price List:*
• 1,000 pcs – ₹11,999/-
• 2,000 pcs – ₹21,999/-
• 5,000 pcs – ₹44,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Waterproof PVC doctor files",
    },

    # ── X-RAY / MEDICAL BAGS ─────────────────────────────────────────────

    "xray_bag_130micron": {
        "name": "X-Ray & Sonography Bags – 130 Micron",
        "keywords": ["x-ray bag", "xray bag", "sonography bag", "x ray bag",
                     "130 micron x-ray bag", "x-ray bag 130 micron",
                     "sonography bag 130 micron", "x-ray sonography bag"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/4158335_XRAY BAG.mp4",
        "photo_url": "",
        "rates": """*🩺 X-RAY & SONOGRAPHY BAGS – 130 MICRON*

*Material:* 130 Micron Plastic
*MOQ:* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹5,999/-
• 10,000 pcs – ₹10,499/-
• 20,000 pcs – ₹18,499/-
• 50,000 pcs – ₹43,999/-
• 1,00,000 pcs – ₹74,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_
🌐 https://rareprint.in""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "130 micron X-ray and sonography bags with multicolor printing",
    },

    "xray_bag_foam_580gauge": {
        "name": "X-Ray Sonography Foam Folder Bags – 580 Gauge",
        "keywords": ["foam folder bag", "580 gauge x-ray bag", "xray foam folder",
                     "sonography foam folder", "580 gauge bag", "foam folder",
                     "x-ray folder bag", "ct scan foam bag"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/4158335_XRAY BAG.mp4",
        "photo_url": "",
        "rates": """*💊 X-RAY SONOGRAPHY FOAM FOLDER BAGS – 580 GAUGE*

*Material:* 580 Gauge Foam
*MOQ:* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹7,999/-
• 10,000 pcs – ₹13,999/-
• 20,000 pcs – ₹24,999/-
• 50,000 pcs – ₹58,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "580 gauge foam folder bags for X-ray and sonography",
    },

    "ct_scan_bag": {
        "name": "CT-Scan Bags – 150 Micron",
        "keywords": ["ct scan bag", "ct-scan bag", "ct scan", "150 micron bag",
                     "ct scan 150 micron"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/4158335_XRAY BAG.mp4",
        "photo_url": "",
        "rates": """*🩺 CT-SCAN BAGS – 150 MICRON*

*Material:* 150 Micron Plastic
*MOQ:* 5,000 pcs

*💰 Price List:*
• 5,000 pcs – ₹6,499/-
• 10,000 pcs – ₹11,499/-
• 20,000 pcs – ₹19,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "150 micron CT-Scan bags with multicolor printing",
    },

    # ── CARRY BAGS ────────────────────────────────────────────────────────

    "nonwoven_handle_multicolor": {
        "name": "Non-Woven Handle Bag – Multicolor",
        "keywords": ["non woven handle bag multicolor", "multicolor non woven bag",
                     "nonwoven handle bag multicolor", "multi color bag",
                     "handle bag multicolor", "printed carry bag"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*💊 NON-WOVEN HANDLE BAG – MULTICOLOR*

*Material:* Non-Woven Fabric
*Printing:* Multicolor
*MOQ:* 2,000 pcs

*💰 Price List:*
• 2,000 pcs – ₹7,999/-
• 5,000 pcs – ₹16,999/-
• 10,000 pcs – ₹29,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor non-woven handle carry bags",
    },

    "nonwoven_handle_singlecolor": {
        "name": "Non-Woven Handle Bag – Single Color",
        "keywords": ["non woven handle bag single color", "single color non woven bag",
                     "nonwoven handle bag single color", "single colour bag",
                     "carry bag single color"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*💊 NON-WOVEN HANDLE BAG – SINGLE COLOR*

*Material:* Non-Woven Fabric
*Printing:* Single Color
*MOQ:* 500 pcs

*💰 Price List:*
• 500 pcs – ₹2,499/-
• 1,000 pcs – ₹3,999/-
• 2,000 pcs – ₹6,499/-
• 5,000 pcs – ₹12,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Single color non-woven handle carry bags",
    },

    "nonwoven_dcut": {
        "name": "Non-Woven Bag – D-Cut",
        "keywords": ["d-cut bag", "d cut bag", "d-cut non woven", "d-cut nonwoven bag",
                     "d cut non woven bag"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*💊 NON-WOVEN D-CUT BAG*

*Material:* Non-Woven Fabric
*Sizes:* 8×10" | 9×12" | 10×14"
*MOQ:* 1,000 pcs

*💰 Price List:*
• 1,000 pcs – ₹2,499/-
• 2,000 pcs – ₹3,999/-
• 5,000 pcs – ₹7,999/-

_📦 Courier Charges Extra_
_💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Non-woven D-cut bags",
    },

    # ── STICKERS ─────────────────────────────────────────────────────────

    "prescription_stickers": {
        "name": "Prescription Stickers",
        "keywords": ["prescription sticker", "medicine sticker", "medical sticker",
                     "bottle sticker", "sticker", "label", "prescription label"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/9243370_STICKER.mp4",
        "photo_url": "",
        "rates": """*💊 PRESCRIPTION STICKERS*

• Multicolour Printing
• Dimensions: 1" × 0.75" inches
• High-Quality Self-Adhesive Labels
• Includes Name Printing

*💰 Price List:*
• 5,000 pcs – ₹999/-
• 10,000 pcs – ₹1,699/-
• 20,000 pcs – ₹2,799/-
• 50,000 pcs – ₹5,499/-
• 1,00,000 pcs – ₹8,499/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor prescription / medicine bottle stickers",
    },

    "homeopathic_stickers": {
        "name": "Homeopathic Bottle Stickers",
        "keywords": ["homeopathic sticker", "homoeopathy sticker", "homeopathic bottle sticker",
                     "homeopathy label", "dram sticker"],
        "media_type": "image",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/2319237_image 15.png",
        "photo_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/2319237_image 15.png",
        "rates": """*💊 HOMEOPATHIC BOTTLE STICKERS*

Multicolour Printing | High-Quality Self-Adhesive

*Available Dimensions:*
• Half Dram: 1.5" × 0.75"
• One Dram: 1.5" × 1"
• Two Dram: 1.75" × 1.25"

*💰 Price List:*
• 5,000 pcs – ₹1,499/-
• 10,000 pcs – ₹2,499/-
• 20,000 pcs – ₹3,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_
🌐 https://rareprint.in/product/homeopathic-stickers-2/""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Homeopathic medicine bottle stickers in half/one/two dram sizes",
    },

    # ── ENVELOPES ─────────────────────────────────────────────────────────

    "envelope_office": {
        "name": "Envelope Printing",
        "keywords": ["envelope", "envelop", "office envelope", "liffafa",
                     "printed envelope", "window envelope", "envelope printing"],
        "media_type": "image",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/6206178_office.JPG",
        "photo_url": "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/67727bb67127df0c20798c5d/6206178_office.JPG",
        "rates": """*ENVELOPE PRINTING RATES*

*Paper Quality:* 70 GSM
*MOQ:* 5,000 pcs

*💰 Rates:*
• 5,000 qty – ₹5,499/-
• 10,000 qty – ₹8,499/-
• 20,000 qty – ₹14,999/-
• 50,000 qty – ₹31,999/-
• 1,00,000 qty – ₹59,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Printed office envelopes with company branding",
    },

    # ── LEAFLETS / PAMPHLETS ─────────────────────────────────────────────

    "leaflet_pamphlet": {
        "name": "Leaflets / Pamphlets",
        "keywords": ["leaflet", "pamphlet", "phamplet", "pomplet", "pamplet",
                     "handbill", "flyer", "flyers", "pamphlets", "leaflets"],
        "media_type": "video",
        "media_url": "https://d3jt6ku4g6z5l8.cloudfront.net/VIDEO/67727bb67127df0c20798c5d/2776468_SMALL.mp4",
        "photo_url": "",
        "rates": """*📄 LEAFLETS / PAMPHLETS – MULTICOLOUR PRINTING*

*Printing:* Multicolor, Single & Double Side
*Sizes:* A4 | A5 | DL
*Paper Quality:* 90 GSM / 130 GSM

*💰 Price List (A4, Single Side):*
• 1,000 pcs – ₹2,999/-
• 2,000 pcs – ₹4,499/-
• 5,000 pcs – ₹8,499/-
• 10,000 pcs – ₹13,999/-

_📦 Courier Charges Extra | 💳 50% COD Available_""",
        "tos": GLOBAL_TOS,
        "payment_link": "",
        "description": "Multicolor leaflets and pamphlets for marketing",
    },
}

# ══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def get_product_by_keyword(text: str) -> dict | None:
    """Return the best matching product for the customer's message."""
    text_lower = text.lower()
    best_match = None
    best_score = 0

    for product in PRODUCTS.values():
        score = 0
        for kw in product["keywords"]:
            if kw in text_lower:
                # Longer keyword matches = more specific = higher priority
                score = max(score, len(kw))
        if score > best_score:
            best_score = score
            best_match = product

    return best_match if best_score > 0 else None


def list_product_names() -> str:
    """Return comma-separated product names for AI context."""
    return ", ".join(p["name"] for p in PRODUCTS.values())


def get_product_by_name(name: str) -> dict | None:
    """Find product by exact or partial name match."""
    name_lower = name.lower()
    for product in PRODUCTS.values():
        if name_lower in product["name"].lower():
            return product
    return None
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       