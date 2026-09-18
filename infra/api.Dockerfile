# DashGoBo API image. Build context is the repo root.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --- Install dependencies (cached on manifest changes) ---
FROM base AS deps
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @dashgobo/api... --frozen-lockfile || pnpm install --filter @dashgobo/api...

# --- Build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @dashgobo/contracts build \
  && pnpm --filter @dashgobo/api build \
  && pnpm --filter @dashgobo/api... --prod deploy /out

# --- Runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/contracts/dist ./node_modules/@dashgobo/contracts/dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
