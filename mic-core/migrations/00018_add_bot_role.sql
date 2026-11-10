-- +goose Up
-- Dev bot accounts (phase-8 D16): bot-<n>, signed in by POST /api/dev/bots, never by Google
-- (google_sub = 'bot:<n>'). The role only marks them; it opens no route.
INSERT INTO roles (name) VALUES ('bot');

-- +goose Down
DELETE FROM roles WHERE name = 'bot';
