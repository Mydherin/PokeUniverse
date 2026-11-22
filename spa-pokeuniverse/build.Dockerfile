# syntax=docker/dockerfile:1
# The SPA's static files: compose.yaml's spa-build service copies them into the volume the spa-pokeuniverse
# service (./Dockerfile: nginx) serves. Build context: repository root (the SPA uses lib-contracts).
# ASSETS: "local" (default, `make up`) ships FireRed's art, sound and the maps as `make assets` left them in
# public/; "built" generates them here from the references at their pinned commits, for a checkout that has
# neither (the Mooi development preview). BuildKit only builds the stages the chosen one needs.
ARG ASSETS=local

# --- Generated assets (ASSETS=built only), each stage cached on its own inputs ---

# The references at the commits their submodules pin (git ls-tree HEAD references/): keep in step when they move.
FROM node:26-alpine AS references
ARG POKEFIRERED_REF=ce6406d8c2eaf46d543c8a2606de0c3cb1951982
ARG EXPANSION_REF=79dd436920845ebc145577649de624f65298c209
WORKDIR /repo/references
RUN fetch() { mkdir -p "/tmp/$1" && wget -qO- "https://codeload.github.com/$2/tar.gz/$3" | tar -xz -C "/tmp/$1" && mv /tmp/"$1"/* "$1"; } \
 && fetch pokefirered pret/pokefirered "$POKEFIRERED_REF" \
 && fetch pokeemerald-expansion rh-hideout/pokeemerald-expansion "$EXPANSION_REF"

# Graphics, text and species art: what `make graphics`, `make text` and `make pokemon` write.
FROM node:26-alpine AS firered-base
COPY --from=references /repo/references /repo/references
COPY lib-contracts/proto /repo/lib-contracts/proto
COPY infra/text /repo/infra/text
COPY infra/pokemon /repo/infra/pokemon

FROM firered-base AS graphics
COPY infra/graphics /repo/infra/graphics
COPY infra/assets /repo/infra/assets
RUN sh /repo/infra/assets/graphics.sh

FROM firered-base AS text
COPY spa-pokeuniverse/src/game/firered/texts.json /repo/spa-pokeuniverse/src/game/firered/texts.json
RUN mkdir -p /repo/spa-pokeuniverse/public/firered/text \
 && node /repo/infra/text/extract.mjs /repo/references/pokefirered /repo/spa-pokeuniverse/src/game/firered/texts.json \
      /repo/spa-pokeuniverse/public/firered/text /repo/references/pokeemerald-expansion /repo/lib-contracts/proto/pokeuniverse

FROM firered-base AS pokemon
RUN mkdir -p /repo/spa-pokeuniverse/public/firered/pokemon \
 && node /repo/infra/pokemon/build.mjs /repo/references/pokefirered /repo/references/pokeemerald-expansion /repo/spa-pokeuniverse/public/firered/pokemon

# Music, sound effects and cries: `make audio`'s render.sh, with the tools of infra/audio/Dockerfile (keep in step).
FROM debian:trixie-slim AS audio
# Quiet steps (a deployment console keeps few lines): each shows its log's end only when it fails.
RUN apt-get -qq update && apt-get -qq install -y --no-install-recommends build-essential cmake pkg-config git ca-certificates jq ffmpeg \
    libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libxext-dev libgl-dev libasound-dev >/tmp/apt.log 2>&1 \
 || { tail -n 40 /tmp/apt.log; exit 1; }; rm -rf /var/lib/apt/lists/* /tmp/apt.log
ARG PORYAAAA_REF=a047cdefd00a17e4649b0fb0c8f46d0004f31fcb
RUN { git clone -q https://github.com/huderlem/poryaaaa /poryaaaa && cd /poryaaaa && git checkout -q $PORYAAAA_REF \
 && git submodule -q update --init --recursive --depth 1 \
 && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --target poryaaaa_render -j \
 && cp build/poryaaaa_render /usr/local/bin/; } >/tmp/build.log 2>&1 || { tail -n 40 /tmp/build.log; exit 1; }
COPY --from=references /repo/references/pokefirered /repo/references/pokefirered
COPY --from=references /repo/references/pokeemerald-expansion/sound /repo/references/pokeemerald-expansion/sound
COPY --from=pokemon /repo/spa-pokeuniverse/public/firered/pokemon/cries.json /repo/spa-pokeuniverse/public/firered/pokemon/cries.json
COPY spa-pokeuniverse/src/game/firered/sounds.json /repo/spa-pokeuniverse/src/game/firered/sounds.json
COPY infra/audio/render.sh /repo/infra/audio/render.sh
RUN sh /repo/infra/audio/render.sh >/tmp/audio.log 2>&1 || { tail -n 40 /tmp/audio.log; exit 1; }

# The maps: tileset art (`make maps` tilesets) and the compiled maps. Same first steps as mic-core/Dockerfile's.
FROM golang:1.27-alpine AS maps
WORKDIR /repo
COPY lib-contracts/go.mod lib-contracts/go.sum lib-contracts/
COPY tool-maps/go.mod tool-maps/go.sum tool-maps/
RUN --mount=type=cache,target=/go/pkg/mod cd tool-maps && go mod download
COPY lib-contracts/gen/go lib-contracts/gen/go
COPY tool-maps tool-maps
COPY lib-maps lib-maps
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p spa-pokeuniverse/public/maps mic-core/maps && cd tool-maps && go run ./cmd/tool-maps compile
COPY --from=references /repo/references/pokefirered /repo/references/pokefirered
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    cd tool-maps && go run ./cmd/tool-maps tilesets

# What public/ gets on top of the checkout: nothing for "local", everything generated above for "built".
FROM node:26-alpine AS assets-local
RUN mkdir /out

FROM node:26-alpine AS assets-built
COPY --from=graphics /repo/spa-pokeuniverse/public/firered/graphics /out/firered/graphics
COPY --from=text /repo/spa-pokeuniverse/public/firered/text /out/firered/text
COPY --from=pokemon /repo/spa-pokeuniverse/public/firered/pokemon /out/firered/pokemon
COPY --from=audio /repo/spa-pokeuniverse/public/firered/audio /out/firered/audio
COPY --from=maps /repo/spa-pokeuniverse/public/firered/tilesets /out/firered/tilesets
COPY --from=maps /repo/spa-pokeuniverse/public/maps /out/maps

FROM assets-${ASSETS} AS assets

# --- The app ---

FROM node:26-alpine AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib-contracts/gen/ts/package.json lib-contracts/gen/ts/
COPY spa-pokeuniverse/package.json spa-pokeuniverse/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter spa-pokeuniverse...
COPY lib-contracts/gen/ts lib-contracts/gen/ts
COPY spa-pokeuniverse spa-pokeuniverse
COPY --from=assets /out/ spa-pokeuniverse/public/
# Dev only (phase-8 D16): any value when the stack runs with BOTS_SECRET, never in production.
ARG VITE_BOT_LOGIN=""
ENV VITE_BOT_LOGIN=${VITE_BOT_LOGIN:+1}
# Public base path, "/" unless served under a prefix (the Mooi preview's): src/app/base.ts.
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
RUN pnpm --filter spa-pokeuniverse build

# The files, copied into the spa-dist volume (mounted at /out) at every start; healthy once they are all there.
FROM alpine:3.22
COPY --from=build /src/spa-pokeuniverse/dist /dist
CMD ["sh", "-c", "rm -f /tmp/ready && find /out -mindepth 1 -delete && cp -R /dist/. /out/ && touch /tmp/ready && exec sleep 2147483647"]
