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

## Production (Vercel + VPS)

### 1) Deploy backend on VPS (EasyPanel)

Use service type Docker Compose and paste [docker-compose.yml](/C:/Users/andre/Documents/Codex/2026-04-29/codex-primeiro-eu-quero-que-voc/automatizador-tiktok/docker-compose.yml).

Before deploy, edit:

- `ALLOWED_ORIGINS=https://automatizador-tiktok.vercel.app`

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
