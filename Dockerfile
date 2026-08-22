# ── Web service ────────────────────────────────────────────────────────────────
# Read-only dashboard. No ffmpeg, no Whisper, no PyTorch — those belong to the
# worker, and bundling them here would turn a ~200MB image into several GB for
# code this service never runs.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
