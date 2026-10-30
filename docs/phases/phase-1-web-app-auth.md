# Phase 1: Web App and Auth

**Goal:** the web application around the game, with login. **No game yet.**

**Status:** done.

## Scope

- [x] SPA shell: design system, routing, responsive layout, PWA basics ([ui.md](../ui.md)).
- [x] Google login, access/refresh tokens, 30-day sliding sessions, roles ([tech-stack.md](../tech-stack.md#authentication)).
- [x] Database migrations for accounts, roles and refresh tokens.
- [x] Home page with its sections and a **Play** button.
- [x] Empty **Admin** section, visible only to admins (`ADMIN_EMAILS`), with access confirmed by the server.
- [x] Empty game screen with an authenticated WebSocket connection.

## Done When

- [x] A player logs in with Google on mobile and desktop and reaches the empty game screen.
- [x] Returning within 30 days needs no new login.
