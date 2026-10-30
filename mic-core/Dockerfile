# syntax=docker/dockerfile:1
# Build context: repository root (mic-core uses lib-contracts).

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY lib-contracts/go.mod lib-contracts/go.sum lib-contracts/
COPY mic-core/go.mod mic-core/go.sum mic-core/
WORKDIR /src/mic-core
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY lib-contracts/gen/go /src/lib-contracts/gen/go
COPY mic-core /src/mic-core
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mic-core ./cmd/mic-core

# Minimal image: static binary, no shell, non-root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/mic-core /mic-core
EXPOSE 8081
ENTRYPOINT ["/mic-core"]
