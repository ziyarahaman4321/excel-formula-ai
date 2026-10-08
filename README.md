# Excel Formula AI

Create, explain and fix formulas for Excel and Google Sheets in plain English.
Pro adds VBA macros, Power Query (M), sample-data-aware formulas and a much
higher daily limit.

Stack: Next.js (App Router), the Anthropic API, Tailwind, deployed on Vercel.
No database and no user accounts.

## How it works

| | Free | Pro |
|---|---|---|
| Daily answers | 5 per visitor | 200 per licence key |
| Excel and Google Sheets | Yes | Yes |
| Create, explain, fix | Yes | Yes |
| VBA and Power Query | No | Yes |
| Paste sample rows | No | Yes |
| Request length | 1,000 characters | 4,000 characters |

- **Free visitors** are counted by IP address.
- **Pro buyers** pay through Lemon Squeezy, which emails them a licence key.
  They paste it into the pricing card once; the browser remembers it and sends
  it with each request. The server checks the key with Lemon Squeezy (cached for
  10 minutes) and counts usage per key.
- A **site-wide daily cap** stops a traffic spike from draining the API balance.

## Run locally

```bash
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000. With only `ANTHROPIC_API_KEY` set the app runs as
free-only: the pricing section and Pro features stay hidden.

## Going live with Pro

1. **Durable limits.** In Vercel, add the Upstash Redis integration (free tier
   is enough). It sets the Redis variables for you. Without it, limits reset
   whenever Vercel starts a new instance, so free users can exceed 5 a day.
2. **Create the product.** In Lemon Squeezy, create a store and a product
   (subscription or one-time). In the product's settings turn on **Generate
   licence keys**, and set the activation limit to unlimited (this app validates
   keys, it does not activate them).
3. **Set environment variables** in Vercel (see `.env.example`):
   - `LEMONSQUEEZY_STORE_ID` — Settings > Stores, the number after `#`
   - `LEMONSQUEEZY_PRODUCT_ID` — optional, restricts Pro to specific products
   - `CHECKOUT_URL` — the product's share/checkout link
   - `PRO_PRICE` — the text on the pricing card, for example `$5 / month`
4. **Redeploy**, buy the product once in Lemon Squeezy test mode, paste the key
   into the pricing card and check that the Pro badge appears.

If a subscription is cancelled or refunded, Lemon Squeezy marks the key
expired or disabled and the app stops accepting it within 10 minutes.

## Configuration

Everything is set through environment variables; see `.env.example` for the
full list and defaults.

## Known limits

- A licence key works in any browser it is pasted into, so a buyer could share
  one. The per-key daily cap (`PRO_DAILY_LIMIT`) bounds the cost of that.
- Free limits are per IP address, so people behind one office network share an
  allowance.
- History is stored in the visitor's browser only.

## Project layout

```
app/page.tsx               reads config on the server, renders the tool
app/tool.tsx               the UI (client component)
app/api/generate/route.ts  plan check, limits, call to Claude
app/api/license/route.ts   validates a licence key when it is first entered
lib/formula.ts             request validation, prompts, response parsing
lib/license.ts             Lemon Squeezy licence validation and cache
lib/usage.ts               daily counters (Upstash Redis or in-memory)
lib/useStored.ts           localStorage hook
```
