# Audio tools for `make audio` (docs/audio.md): poryaaaa's renderer (the GBA m4a engine) and ffmpeg.
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake pkg-config git ca-certificates jq ffmpeg \
    libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libxext-dev libgl-dev libasound-dev && rm -rf /var/lib/apt/lists/*
# Pinned: the commit validated in docs/audio.md.
ARG PORYAAAA_REF=a047cdefd00a17e4649b0fb0c8f46d0004f31fcb
RUN git clone https://github.com/huderlem/poryaaaa /poryaaaa && cd /poryaaaa && git checkout $PORYAAAA_REF \
 && git submodule update --init --recursive --depth 1 \
 && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --target poryaaaa_render -j \
 && cp build/poryaaaa_render /usr/local/bin/
