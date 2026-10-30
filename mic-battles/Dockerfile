# syntax=docker/dockerfile:1
# Build context: repository root (mic-battles uses lib-contracts).

FROM node:26-alpine AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib-contracts/gen/ts/package.json lib-contracts/gen/ts/
COPY mic-battles/package.json mic-battles/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter mic-battles...
COPY lib-contracts/gen/ts lib-contracts/gen/ts
COPY mic-battles mic-battles
RUN pnpm --filter mic-battles build

# One bundled file, no node_modules, non-root.
FROM node:26-alpine
WORKDIR /app
COPY --from=build /src/mic-battles/dist/main.js ./main.js
USER node
EXPOSE 8082
CMD ["node", "main.js"]
