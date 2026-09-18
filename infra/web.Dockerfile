# DashGoBo web image. Build context is the repo root.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @dashgobo/web... --frozen-lockfile || pnpm install --filter @dashgobo/web...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @dashgobo/contracts build \
  && pnpm --filter @dashgobo/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=build /repo ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@dashgobo/web", "start"]
