# Phase 1: Web App and Auth

**Goal:** the web application around the game, with login. **No game yet.**

## Scope

- SPA shell: design system, routing, responsive layout, PWA basics ([ui.md](../ui.md)).
- Google login, access/refresh tokens, 30-day sliding sessions, roles ([tech-stack.md](../tech-stack.md#authentication)).
- Database migrations for accounts, roles and refresh tokens.
- Home page with its sections and a **Play** button.
- Empty **Admin** section, visible only to admins (`ADMIN_EMAILS`), with access confirmed by the server.
- Empty game screen with an authenticated WebSocket connection.

## Done When

- A player logs in with Google on mobile and desktop and reaches the empty game screen.
- Returning within 30 days needs no new login.
