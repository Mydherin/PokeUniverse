# The public web server: serves the SPA's static files from the spa-dist volume (built by build.Dockerfile,
# copied there by compose.yaml's spa-build service) and proxies /auth, /api and /ws to mic-core.
# Build context: this folder (only nginx/ is sent, see .dockerignore).
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 8080
