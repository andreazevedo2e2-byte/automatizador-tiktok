# Postiz self-hosted no VPS

Este projeto ja aceita `POSTIZ_URL` + `POSTIZ_API_KEY`.
Quando essas duas variaveis estiverem preenchidas no backend, o app para de depender do OAuth do Postiz Cloud.

## O que usar no EasyPanel

1. Crie um novo servico `Compose`.
2. Use como base o `docker-compose.yaml` oficial do Postiz:
   - https://docs.postiz.com/installation/docker-compose
   - https://github.com/gitroomhq/postiz-docker-compose
3. Configure as variaveis principais do Postiz com base no arquivo `postiz.env.example` desta pasta.
4. Exponha o Postiz em um dominio HTTPS publico.

## Variaveis minimas

- `MAIN_URL=https://seu-postiz.dominio.com`
- `FRONTEND_URL=https://seu-postiz.dominio.com`
- `NEXT_PUBLIC_BACKEND_URL=https://seu-postiz.dominio.com/api`
- `JWT_SECRET=troque-por-um-valor-grande`
- `DATABASE_URL=postgresql://postiz-user:postiz-password@postiz-postgres:5432/postiz-db-local`
- `REDIS_URL=redis://postiz-redis:6379`
- `BACKEND_INTERNAL_URL=http://localhost:3000`
- `TEMPORAL_ADDRESS=temporal:7233`
- `IS_GENERAL=true`
- `DISABLE_REGISTRATION=false`
- `RUN_CRON=true`
- `STORAGE_PROVIDER=local`
- `UPLOAD_DIRECTORY=/uploads`
- `NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads`

## TikTok

Para o TikTok funcionar dentro do Postiz self-hosted, voce ainda precisa configurar o app do TikTok Developer:

- `TIKTOK_CLIENT_ID=...`
- `TIKTOK_CLIENT_SECRET=...`

Redirect URI do app TikTok no Postiz:

- `https://seu-postiz.dominio.com/integrations/social/tiktok`

## Depois do deploy

1. Abra o painel do seu Postiz self-hosted.
2. Gere uma API key nas configuracoes do Postiz.
3. No backend do `automatizador-tiktok`, configure:
   - `POSTIZ_URL=https://seu-postiz.dominio.com`
   - `POSTIZ_API_KEY=cole-a-api-key`
4. Reinicie o backend.

## Importante

- O upload do TikTok exige midia publica em HTTPS.
- Se o Postiz usar `/uploads` local, esse caminho precisa estar publico pelo dominio.
- Se quiser mais robustez, troque para bucket publico/CDN depois.
