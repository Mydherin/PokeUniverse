-- +goose Up
-- The OPTION menu's choices (Phase 4), with FireRed's defaults; New Game resets them.
ALTER TABLE trainers
    ADD COLUMN text_speed   text     NOT NULL DEFAULT 'mid'   CHECK (text_speed IN ('slow', 'mid', 'fast')),
    ADD COLUMN battle_scene text     NOT NULL DEFAULT 'on'    CHECK (battle_scene IN ('on', 'off')),
    ADD COLUMN battle_style text     NOT NULL DEFAULT 'shift' CHECK (battle_style IN ('shift', 'set')),
    ADD COLUMN sound        text     NOT NULL DEFAULT 'mono'  CHECK (sound IN ('mono', 'stereo')),
    ADD COLUMN button_mode  text     NOT NULL DEFAULT 'help'  CHECK (button_mode IN ('help', 'lr', 'l_equals_a')),
    ADD COLUMN frame        smallint NOT NULL DEFAULT 1       CHECK (frame BETWEEN 1 AND 10);

-- +goose Down
ALTER TABLE trainers
    DROP COLUMN text_speed, DROP COLUMN battle_scene, DROP COLUMN battle_style,
    DROP COLUMN sound, DROP COLUMN button_mode, DROP COLUMN frame;
