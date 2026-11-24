# syntax=docker/dockerfile:1

FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production
# Fly.io's default internal port. Our app reads PORT from env.
ENV PORT=8080

# ─── Install production deps ──────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# Install tsx too so we can run the TypeScript sources directly at runtime.
# Simpler than a build step and the image stays small (~160 MB).
RUN npm ci --omit=dev && npm install tsx --no-save

# ─── Final image ──────────────────────────────────────────────────────────
FROM base
COPY --from=deps /app/node_modules /app/node_modules
COPY package.json ./
COPY src ./src

EXPOSE 8080
CMD ["node", "--import", "tsx", "src/index.ts"]
