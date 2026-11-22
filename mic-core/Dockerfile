# syntax=docker/dockerfile:1
# Build context: repository root (mic-core uses lib-contracts).
# ASSETS: "local" (default, `make up`) embeds the maps `make maps` compiled into mic-core/maps/; "built" compiles
# them here from lib-maps (a checkout without them: the Mooi development preview). BuildKit skips the unused stage.
ARG ASSETS=local

# The maps, compiled by tool-maps (ASSETS=built only). Same steps as spa-pokeuniverse/Dockerfile's, so they share the cache.
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

# What mic-core/maps/ gets on top of the checkout: nothing for "local", the maps compiled above for "built".
FROM golang:1.27-alpine AS maps-local
RUN mkdir -p /repo/mic-core/maps

FROM maps AS maps-built

FROM maps-${ASSETS} AS assets

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY lib-contracts/go.mod lib-contracts/go.sum lib-contracts/
COPY mic-core/go.mod mic-core/go.sum mic-core/
WORKDIR /src/mic-core
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY lib-contracts/gen/go /src/lib-contracts/gen/go
COPY mic-core /src/mic-core
COPY --from=assets /repo/mic-core/maps/ /src/mic-core/maps/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mic-core ./cmd/mic-core

# Minimal image: static binary, no shell, non-root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/mic-core /mic-core
EXPOSE 8081
ENTRYPOINT ["/mic-core"]
