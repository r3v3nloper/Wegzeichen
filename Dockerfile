# ── Stage 1: Build (mit Kompilier-Tools für better-sqlite3) ──────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime (sauberes Image ohne Build-Tools) ───────────────────────
FROM node:20-alpine

WORKDIR /app

# Kompilierte node_modules aus dem Builder-Stage übernehmen
COPY --from=builder /app/node_modules ./node_modules

COPY . .

# Leaflet, marked und DOMPurify aus node_modules nach public/vendor kopieren,
# damit Karte und Markdown-Ansicht ohne CDN und ohne Aufweichen der CSP laufen
RUN node scripts/vendor-leaflet.js && node scripts/vendor-markdown.js

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

EXPOSE 3000

# Datenbank und Datei-Anhänge (wird von außen gemountet)
VOLUME ["/data"]

CMD ["node", "server.js"]
