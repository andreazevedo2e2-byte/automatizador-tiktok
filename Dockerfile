FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4141
ENV HOST=0.0.0.0
ENV HEADLESS=false
ENV DISPLAY=:99

RUN apt-get update && apt-get install -y --no-install-recommends \
  xvfb \
  x11vnc \
  fluxbox \
  novnc \
  websockify \
  xauth \
  x11-utils \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x /app/docker/start.sh

EXPOSE 4141
EXPOSE 6080

CMD ["/app/docker/start.sh"]
