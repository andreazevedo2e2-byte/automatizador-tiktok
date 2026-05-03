# Automatizador TikTok

App local/web para capturar slideshows do TikTok, extrair o texto, revisar em português, aplicar em novas imagens e enviar o resultado final para uma pasta do Google Drive.

## Fluxo atual

1. Cole o link do slideshow do TikTok ou envie prints.
2. Revise o texto em português.
3. Envie as novas imagens na ordem desejada.
4. Gere o preview final.
5. Escolha uma pasta de perfil no Google Drive.
6. O app cria automaticamente uma subpasta como `post 1`, `post 2`, `post 3` e envia:
   - slides renderizados
   - `caption.txt`
   - `hashtags.txt`
   - `post.json`

## Setup local

1. Copie `.env.example` para `.env`.
2. Preencha:
   - `VITE_API_BASE`
   - `VITE_GOOGLE_CLIENT_ID`
3. Rode:

```bash
npm install
npm run dev
```

Abra `http://127.0.0.1:5173`.

## Variáveis principais

- `VITE_API_BASE=http://127.0.0.1:4141`
- `VITE_GOOGLE_CLIENT_ID=seu-client-id-do-google`
- `ALLOWED_ORIGINS=https://automatizador-tiktok.vercel.app`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

## Produção

### Frontend

Pode ser publicado na Vercel usando este diretório como raiz, com `vercel.json`.

### Backend

Pode ser publicado no VPS/EasyPanel usando [docker-compose.yml](/C:/Users/andre/Documents/Codex/2026-04-29/codex-primeiro-eu-quero-que-voc/automatizador-tiktok/docker-compose.yml).

Antes do deploy, ajuste pelo menos:

- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_GOOGLE_CLIENT_ID`

## Observações

- A extração do TikTok usa perfil persistente do Playwright em `browser-profile/`.
- O backend tenta Google Chrome, depois Edge, depois Chromium do Playwright.
- Se o TikTok bloquear login, use `Upload Images` para OCR por prints.
- Cada execução fica salva em `runs/<timestamp>/`.
- O Google Drive lista as pastas reais da raiz da conta conectada; se você renomear a pasta no Drive, o nome atualizado aparece no app ao recarregar.

## Supabase

Se quiser histórico persistente de runs e envios ao Drive:

1. Rode `supabase/schema.sql` no SQL Editor.
2. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente no backend.
