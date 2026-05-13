# ── Stage 1: build ──────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts

COPY src/ src/
RUN npx tsc -p tsconfig.json

# ── Stage 2: production ────────────────────────────────────────────
FROM node:24-slim AS production
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system openrna && adduser --system --ingroup openrna openrna

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist/ dist/

USER openrna

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
