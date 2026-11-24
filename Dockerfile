# syntax=docker/dockerfile:1

FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
# Fly's default internal port. src/index.ts reads PORT from env.
ENV PORT=8080

# Install prod deps plus tsx so we can run the TypeScript sources directly.
# Simpler than a separate build step; image stays ~180 MB.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save tsx

COPY src ./src

EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
