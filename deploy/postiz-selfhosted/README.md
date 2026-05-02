# Postiz self-hosted no VPS

Este projeto ja aceita `POSTIZ_URL` + `POSTIZ_API_KEY`.
Quando essas duas variaveis estiverem preenchidas no backend, o app para de depender do OAuth do Postiz Cloud.

## O que usar no EasyPanel

1. Crie um novo servico `Compose`.
2. Na aba `Git`, use este proprio repositorio.
3. Configure:
   - `Repository URL`: `https://github.com/andreazevedo2e2-byte/automatizador-tiktok`
   - `Branch`: `main`
   - `Build Path`: `/deploy/postiz-selfhosted`
   - `Docker Compose File`: `docker-compose.easypanel.yaml`
4. Na aba `Environment`, cole o conteudo de `postiz.env.example` adaptado.
5. Exponha o servico `postiz` em um dominio HTTPS publico.

## Variaveis minimas

- `POSTIZ_MAIN_URL=https://seu-postiz.dominio.com`
- `POSTIZ_JWT_SECRET=...`
- `POSTIZ_DB_USER=postiz-user`
- `POSTIZ_DB_PASSWORD=...`
- `POSTIZ_DB_NAME=postiz-db`
- `TEMPORAL_DB_USER=temporal`
- `TEMPORAL_DB_PASSWORD=...`
- `TEMPORAL_DB_NAME=temporal`

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
