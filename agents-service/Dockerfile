# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app
COPY agents-service/package*.json ./
RUN npm ci
COPY agents-service/tsconfig.json ./
COPY agents-service/src ./src
RUN npx tsc

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY agents-service/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Copy agent prompts from the parent repo into the image so loadAgentPrompt() can read them.
# Build context is the project root (set in fly.toml) so this path is reachable.
COPY agents-v2 ./agents-v2

EXPOSE 3000
CMD ["node", "dist/server.js"]
