# MABA AI Detector

Photo upload karo aur dekho wo kitne percent **AI-generated** hai aur kitne
percent **original**. Detection [Sightengine](https://sightengine.com) ke
`genai` model se hoti hai — photo ke pixels analyze hote hain, sirf
metadata nahi.

## Features

- Photo upload (drag & drop ya file picker — JPG, PNG, WebP, max 10 MB)
- Image URL se bhi check
- AI % vs Original % bars, Roman Urdu verdict, top AI-generator scores
- Har result par honesty note: score ek probability hai, 100% yaqeen nahi
- Pehle ki checks ki history browser ke localStorage mein (Clear button ke saath)
- Roman Urdu UI, dark theme, red accent

## Sightengine key kaise lo (free)

1. [sightengine.com](https://sightengine.com) par jao aur **free account**
   banao (card nahi chahiye).
2. Dashboard mein **API** section se `API User` aur `API Secret` copy karo.
3. Free plan: **2,000 operations/mahina** (genai detection = 5 operations
   per image, matlab lag bhag **400 photos/mahina** free).

## Local setup

```bash
npm install
cp .env.example .env.local
# .env.local mein apni keys daalo:
# SIGHTENGINE_API_USER=...
# SIGHTENGINE_API_SECRET=...
npm run dev
```

Phir http://localhost:3000 kholo.

## Vercel par deploy

1. Is repo ko GitHub par push karo.
2. Vercel mein **Import Project** karo (Next.js auto-detect ho jayega).
3. **Project Settings → Environment Variables** mein ye dono lagao:
   - `SIGHTENGINE_API_USER`
   - `SIGHTENGINE_API_SECRET`
4. Deploy karo. Keys kabhi code mein ya repo mein nahi honi chahiye — sirf
   server-side environment variables mein.

## API

`POST /api/check` — multipart form:

- `media`: image file (JPG/PNG/WebP, max 10 MB), **ya**
- `url`: image ka `https://` link

Response:

```json
{
  "aiPercent": 87,
  "realPercent": 13,
  "verdict": "AI-generated lagti hai",
  "generators": [{ "name": "Midjourney", "percent": 87 }],
  "error": null
}
```

Keys nahi lagi hon to clean Roman Urdu error milta hai (HTTP 503):

```json
{ "error": "API key nahi lagi — Sightengine ki key lagao" }
```

## Limitations (honest)

- Koi bhi AI detector 100% sahi nahi hota — score ek probability hai.
  Detector kabhi kabhi real photo ko bhi AI keh sakta hai.
- Free plan ki limit: lag bhag 400 checks/mahina. Limit khatam hone par
  Sightengine 402/429 dega aur app saaf Roman Urdu message dikhayegi.
- Bina real key ke app koi fake percentage nahi dikhata — sirf key-missing
  error dikhata hai.
