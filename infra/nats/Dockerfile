# NATS with this folder's config baked in (no bind mount, so any Docker host can run it). Build context: infra/nats.
FROM nats:2.12-alpine
COPY nats.conf /etc/nats/nats.conf
