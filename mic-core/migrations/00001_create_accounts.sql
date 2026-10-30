-- +goose Up
CREATE TABLE accounts (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    google_sub    text        NOT NULL UNIQUE, -- Google's stable account ID
    email         text        NOT NULL,
    display_name  text        NOT NULL,
    picture_url   text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id   smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE
);

INSERT INTO roles (name) VALUES ('user'), ('admin');

CREATE TABLE account_roles (
    account_id bigint   NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    role_id    smallint NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (account_id, role_id)
);

-- +goose Down
DROP TABLE account_roles;
DROP TABLE roles;
DROP TABLE accounts;
