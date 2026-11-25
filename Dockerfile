# syntax=docker/dockerfile:1

# ── Stage 1: build the Vite docs bundle ──────────────────────────────────────
FROM node:20-slim AS docs-build
WORKDIR /app
COPY package.json package-lock.json ./
# Full install (dev deps included) so vite + tailwind + react are available.
RUN npm ci --legacy-peer-deps
COPY vite.config.ts tailwind.config.js postcss.config.js tsconfig.docs.json ./
COPY docs ./docs
RUN npm run docs:build

# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
# Fly's default internal port. src/index.ts reads PORT from env.
ENV PORT=8080

# Prod deps only, plus tsx to run the TypeScript sources directly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm install --no-save tsx

COPY src ./src
COPY --from=docs-build /app/docs-dist ./docs-dist

EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
