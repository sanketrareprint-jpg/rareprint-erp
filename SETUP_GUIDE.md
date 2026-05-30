# WhatsApp AI Sales Chatbot — Setup Guide
**For Rareprint × AiSensy × Gemini 2.0 Flash**

---

## How It Works

```
Customer sends WhatsApp msg
         ↓
AiSensy receives it → fires webhook to your server
         ↓
Bot detects product keyword (e.g. "business card")
         ↓
Automatically sends: [Product Photo/Video] + [Rates] + [Terms of Service]
         ↓
Gemini AI continues conversation:
  → Answers questions
  → Collects quantity, design details, deadline
  → Asks for name, city, email
  → Persuades & closes
  → Sends payment link
         ↓
Order confirmed → design file collected on WhatsApp chat
```

---

## Step 1: Get Your API Keys

### A. Google Gemini (Free Tier Available)
1. Go to https://aistudio.google.com/apikey
2. Click **Create API Key**
3. Copy it — starts with `AIza...`
> Free tier: 1,500 requests/day, 15 requests/min. Paid: ~$0.075/1M tokens (very cheap).

### B. AiSensy API Key
1. Login to AiSensy dashboard
2. Go to **Settings → API & Webhook**
3. Copy your **API Key**
4. Copy your **Username**

---

## Step 2: Configure Products (`products.py`)

Open `products.py` and fill in for each product:

```python
"photo_url": "https://your-cdn.com/image.jpg",   # Direct HTTPS link to product image
"video_url": "https://your-cdn.com/video.mp4",   # Optional — leave "" if no video
"payment_link": "https://rzp.io/l/yourlink",      # Razorpay or any payment page
```

**Where to host images/videos:**
- Upload to Google Drive → Right-click → Get Link → Change to "Anyone with link" → Use direct download URL
- Or use Cloudinary (free tier) — gives direct HTTPS URLs
- Or any web hosting / your website

**Update rates and ToS** text in the same file for each product.

---

## Step 3: Deploy to Railway

1. Create a free account at https://railway.app
2. New Project → Deploy from GitHub (push this folder to GitHub first)
   OR: New Project → Deploy from local → drag the folder
3. Add **Environment Variables** in Railway dashboard:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | `AIza-xxxx` |
| `AISENSY_API_KEY` | Your AiSensy key |
| `AISENSY_USERNAME` | Your AiSensy username |
| `BUSINESS_NAME` | `Rareprint` |
| `BUSINESS_PHONE` | `+91-XXXXXXXXXX` |
| `ALL_PRODUCTS_PDF_URL` | Direct HTTPS link to the all-products catalog PDF |
| `FOLLOWUP_ENABLED` | `true` to send normal follow-ups within 24 hours |
| `FOLLOWUP_DELAYS_SECONDS` | `600,3600,10800,82800` for 10 min, 1 hr, 3 hr, 23 hr |
| `FOLLOWUP_POLL_SECONDS` | `60` |

4. Railway will auto-deploy. Copy your public URL (e.g. `https://your-app.railway.app`)

---

## Step 4: Set Webhook in AiSensy

1. AiSensy Dashboard → **Settings → Webhook**
2. Set Webhook URL to: `https://your-app.railway.app/webhook`
3. Enable: **Incoming Messages**
4. Save

---

## Step 5: Test It

Send a WhatsApp message to your AiSensy number:
- "I need business cards" → Should get photo + rates + ToS immediately
- "What are flyer prices?" → Should get flyer template
- Any follow-up → AI continues conversation

---

## Adding New Products

Edit `products.py` — copy an existing product block and fill in the details. The AI and template system automatically pick it up.

---

## File Structure

```
whatsapp-ai-chatbot/
├── main.py              # Webhook server (FastAPI)
├── ai_agent.py          # Gemini AI sales agent
├── aisensy_client.py    # AiSensy API wrapper
├── products.py          # Your product catalog ← edit this
├── conversation_store.py# Session & lead tracking
├── requirements.txt     # Python packages
├── railway.toml         # Railway config
├── Procfile             # Process startup
└── .env.example         # Environment variables template
```

---

## Conversation Flow Example

```
Customer: "hi, need visiting cards"
Bot: [Sends business card photo + rates image]
Bot: [Sends ToS text]
Bot (AI): "Hi! 👋 Great choice! Business cards ready within 2 days.
           Kitni quantity chahiye aapko? 😊"

Customer: "500 pcs, double sided"
Bot (AI): "Perfect! Double side included in our rates 👍
           Aapke paas design ready hai, ya hum design bhi karein?
           Logo/text share karein toh quote de sakta hoon!"

Customer: "I have design in PDF"
Bot (AI): "Excellent! PDF perfect hai 🎯
           Aapka naam aur city bataiye — aur delivery urgent hai kya?"

Customer: "Sanket, Pune, needed by Friday"
Bot (AI): "Sanket ji, Pune ke liye Friday delivery possible hai! ✅
           Aapka email ID share karein — order confirmation bhejta hoon.
           Payment karna hai to link bhej raha hoon 👇"
Bot: [Sends Razorpay payment link]
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot not responding | Check Railway logs, verify webhook URL in AiSensy |
| Template not sending | Verify `photo_url` is a direct HTTPS URL (test in browser) |
| AI replies in wrong language | Edit system prompt in `ai_agent.py` |
| Prices not updating | Edit `products.py` and redeploy |
| Sessions resetting on restart | Add Redis URL in Railway env vars |
