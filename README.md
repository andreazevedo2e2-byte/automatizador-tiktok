# Automatizador TikTok

Local web app for capturing TikTok photo slideshows and running OCR.

## Setup

1. Copy `.env.example` to `.env`.
2. Run:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`.

## Notes

- TikTok extraction uses a persistent Playwright browser profile in `browser-profile/`.
- The backend prefers your installed Google Chrome, then Edge, then Playwright Chromium.
- If TikTok asks for login, click `Open Login Browser`, log in, and run extraction again.
- If TikTok blocks login, use `Upload Images` to OCR screenshots or downloaded slide images directly.
- Each extraction is saved under `runs/<timestamp>/`.
- The final step can send rendered slides to Postiz as a safe TikTok draft/upload flow.

## Production (Vercel + VPS)

### 1) Deploy backend on VPS (EasyPanel)

Use service type Docker Compose and paste [docker-compose.yml](/C:/Users/andre/Documents/Codex/2026-04-29/codex-primeiro-eu-quero-que-voc/automatizador-tiktok/docker-compose.yml).

Before deploy, edit:

- `ALLOWED_ORIGINS=https://automatizador-tiktok.vercel.app`
- `POSTIZ_URL=https://seu-postiz-na-vps.com`
- `POSTIZ_API_KEY=...`
- `SUPABASE_URL=...` and `SUPABASE_SERVICE_ROLE_KEY=...` if you want persistent history.

Expose port `4141` via your domain, for example:

- `https://api.seudominio.com`

### 2) Deploy frontend on Vercel

Project root: this folder (`automatizador-tiktok`), using [vercel.json](/C:/Users/andre/Documents/Codex/2026-04-29/codex-primeiro-eu-quero-que-voc/automatizador-tiktok/vercel.json).

Live frontend:

- `https://automatizador-tiktok.vercel.app`

### 3) Login session flow

In the deployed frontend:

1. Click `Open Login Browser` once (this initializes profile session).
2. If TikTok blocks login on the server environment, use `Upload Images` fallback.
3. Keep `browser-profile` persistent volume mounted (already in compose).

## Postiz + Supabase

1. Install Postiz self-hosted on EasyPanel and connect your TikTok accounts there.
2. Generate a Postiz API key and set `POSTIZ_URL` + `POSTIZ_API_KEY` in the backend.
3. In Supabase SQL Editor, run `supabase/schema.sql`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only on the backend, never in Vercel frontend env.
5. The app sends posts as a draft/upload flow by default; publish/final approval stays manual in TikTok.
