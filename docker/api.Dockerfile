# Build context: repository root.  docker build -f docker/api.Dockerfile .
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN npm ci

FROM deps AS build
COPY packages packages
COPY apps/api apps/api
RUN npm run prisma:generate -w @smartdine/api && npm run build -w @smartdine/api

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN npm ci --omit=dev --workspace @smartdine/api --include-workspace-root
COPY apps/api/prisma apps/api/prisma
RUN cd apps/api && npx prisma generate
COPY --from=build /app/apps/api/dist apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v2/health || exit 1
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
