FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4141
ENV HOST=0.0.0.0
ENV HEADLESS=true

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 4141

CMD ["node", "server/server.cjs"]
