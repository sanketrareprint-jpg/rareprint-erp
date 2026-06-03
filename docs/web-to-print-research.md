# RarePrint Web-To-Print Research Notes

## Public RarePrint Data Captured

RarePrint is currently positioned around healthcare/medical print, business identity print, marketing material, and corporate novelty products.

Primary public features:
- In-house design support.
- Medical and hospital print expertise.
- Fast turnaround.
- PAN India delivery.
- Custom sizes and GSM.
- Upload files and design online actions on product pages.
- 50% advance / 50% on delivery policy.
- Shipping charges extra on product pages.
- Rates inclusive of GST on medicine pouch pages.

Industries served:
- Hospitals.
- Medical stores.
- Clinics.
- Pharma distributors.
- Diagnostic labs.
- Retail businesses.
- Professionals.

Public product groups seen:
- Medicine pouches.
- Prescription stickers and pharma packaging.
- Visiting cards.
- Envelopes.
- Letterheads.
- Doctor files.
- Bill books.
- Non-woven bags.
- Keychains.
- Pens.
- Mobile stands.
- Clip boards.
- Corporate promotional items.

Example public medicine pouch rates:

| Product | Size | GSM | Quantity | Public rate |
| --- | --- | --- | ---: | ---: |
| Small medicine pouch | 4 x 5 inch | 70 | 5,000 | Rs. 4,999 to Rs. 5,000 |
| Small medicine pouch | 4 x 5 inch | 70 | 10,000 | Rs. 7,500 to Rs. 7,999 |
| Small medicine pouch | 4 x 5 inch | 70 | 20,000 | Rs. 12,000 to Rs. 13,499 |
| Small medicine pouch | 4 x 5 inch | 70 | 50,000 | Rs. 27,000 to Rs. 31,999 |
| Small medicine pouch | 4 x 5 inch | 70 | 1,00,000 | Rs. 50,000 to Rs. 55,499 |
| Medium medicine pouch | 4 x 7 inch | 70 | 5,000 | Rs. 5,499 |
| Medium medicine pouch | 4 x 7 inch | 70 | 10,000 | Rs. 8,499 |
| Medium medicine pouch | 4 x 7 inch | 70 | 20,000 | Rs. 14,999 |
| Medium medicine pouch | 4 x 7 inch | 70 | 50,000 | Rs. 31,999 |
| Medium medicine pouch | 4 x 7 inch | 70 | 1,00,000 | Rs. 59,999 |
| Extra large medicine pouch | 8.5 x 11 inch | 70 | 5,000 | Rs. 9,999 |
| Extra large medicine pouch | 8.5 x 11 inch | 70 | 10,000 | Rs. 17,999 |
| Extra large medicine pouch | 8.5 x 11 inch | 70 | 20,000 | Rs. 31,999 |
| Extra large medicine pouch | 8.5 x 11 inch | 70 | 50,000 | Rs. 71,999 |
| Extra large medicine pouch | 8.5 x 11 inch | 70 | 1,00,000 | Rs. 1,49,999 |

Other public examples:
- Plastic ball pen customized printing: MOQ 1000, single color, visible prices around Rs. 7.40 to Rs. 8.00 per item.
- Keychain products use 50% advance flow.

## Web-To-Print Feature Set To Build

Core commerce:
- Product catalog with categories, filters, search, product pages, variant selector, MOQ, quantity slabs, taxes, shipping estimate, and reorder.
- Cart, checkout, customer account, order status, invoice, payment receipt, and abandoned cart follow-up.
- Payment gateways: Razorpay, Cashfree, UPI, bank transfer, partial payment, payment verification.
- Shipping: connector abstraction for Shiprocket now and Bigship next, AWB tracking, COD/prepaid rules, shipping charge sync.

Design studio:
- Upload print-ready artwork.
- Template-based editor for common products.
- AI design prompt generator and layout helper.
- Canva partnership/API path for embedded design creation/export.
- Proof approval workflow with print-safe checks.

ERP integration:
- Public checkout creates ERP orders with lead source `WEB_TO_PRINT`.
- Product and rate data should come from database tables, not frontend code.
- Order should enter accounts approval, production, design file, and dispatch flows.
- Customer portal should read ERP order status and shipment tracking.

Futuristic layer:
- MCP tools for order lookup, customer history, rates, paper stock, production ETA, courier tracking, and task creation.
- AI quote assistant for product, size, quantity, GSM, side, finish, and delivery suggestions.
- AI artwork preflight for bleed, resolution, spelling checks, color mode, safe margin, and duplicate order detection.
- WhatsApp bot for quote, payment reminder, proof approval, order status, and repeat order.
- SEO city/category landing pages with structured data.

## Competitor-Inspired Ideas

VistaPrint-style:
- Broad categories: visiting cards, flyers, banners, invitations, clothing, gifting, labels, stickers, packaging, office supplies.
- Online design tools, custom upload, design services, logo maker, QR code generator.
- Product variants such as rounded, square, spot UV, raised foil, matte, glossy, kraft, transparent, NFC cards, labels, packaging boxes, bags, tags, and custom shape stickers.

PrintMine/web-to-print-style:
- Simple product-first navigation.
- Fast quote/order flow.
- Upload design or request design help.
- Customer-friendly delivery and support messaging.

Canva API path:
- Canva Connect APIs can create designs through REST.
- Canva Print Partnerships JavaScript API supports initializing Canva and creating a design inside the editor for print-partner workflows.
- Canva developer platform has APIs for assets, export, import by URL, resize, folders, and metadata.

## Immediate Data Model Direction

Keep separate editable databases for:
- Product categories.
- Product master.
- Product variant options.
- Rate slabs.
- Finishes/add-ons.
- Templates.
- Shipping serviceability and charges.
- Payment settings.
- SEO pages and content blocks.

The existing ERP already has `ProductCategory`, `Product`, `ProductCostSlab`, `Order`, `OrderItem`, `Payment`, `Shipment`, and `designFiles`, so the next step is to expose admin-safe screens for storefront product/rate maintenance.

## Current Import Status

- Imported 593 products from the live RarePrint WooCommerce Store API into `frontend/app/web-to-print/rareprint-catalog.json`.
- Simple products include current WooCommerce prices.
- Verified public slab tables were added for small, medium, and extra-large medicine pouches plus A4 multicolor letterpad.
- Variable products whose combination prices are not exposed by the Store API are marked with `hasVariableRatesToConfirm: true`; their options/MOQs/categories/images are imported and their final rate rows can be corrected from the database.
- Checkout mode is set to 50% Razorpay advance with remaining balance as COD.
- Shipping provider is currently Shiprocket, with Bigship intended as the next connector.
