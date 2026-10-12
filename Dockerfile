# HelloEventHub cloud app: one Node process serving the API (/api/v1) and the web app.
# Build:  docker build -t helloeventhub .
# Run:    docker run --env-file .env -p 3000:3000 helloeventhub
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/venue/package.json apps/venue/
RUN npm ci --no-audit --no-fund --workspace packages/contracts --workspace apps/api --workspace apps/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/web apps/web
ARG APP_VERSION=0.1.0
ENV APP_VERSION=$APP_VERSION
RUN npm run build -w apps/web && npm run build -w apps/api

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/venue/package.json apps/venue/
RUN npm ci --omit=dev --no-audit --no-fund --workspace apps/api --include-workspace-root=false && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
