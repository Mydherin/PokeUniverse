# syntax=docker/dockerfile:1
# Build context: repository root (the SPA uses lib-contracts).

FROM node:26-alpine AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib-contracts/gen/ts/package.json lib-contracts/gen/ts/
COPY spa-pokeuniverse/package.json spa-pokeuniverse/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY lib-contracts/gen/ts lib-contracts/gen/ts
COPY spa-pokeuniverse spa-pokeuniverse
RUN pnpm --filter spa-pokeuniverse build

# Static files only, served by an unprivileged nginx.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY spa-pokeuniverse/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY spa-pokeuniverse/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/spa-pokeuniverse/dist /usr/share/nginx/html
EXPOSE 8080
