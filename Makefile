# Shared commands. Every tool runs in Docker: only Docker and Make are needed on the host.

GO_IMAGE   := golang:1.27-alpine
BUF_IMAGE  := bufbuild/buf:1.59.0
SQLC_IMAGE := sqlc/sqlc:1.30.0
NODE_IMAGE := node:26-alpine
PNPM       := npm install -g pnpm@10 >/dev/null 2>&1 && pnpm

RUN := docker run --rm -v "$(CURDIR)":/repo
GO_CACHE := -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build

.PHONY: help env up down logs ps clean generate contracts sqlc tidy lock breaking assets graphics text audio

# FireRed's assets come from the decompilation at build time, into a gitignored folder; never committed (docs/tech-stack.md#firered-as-reference).
FIRERED     := references/pokefirered
FIRERED_OUT := spa-pokeuniverse/public/firered
FIRERED_GFX := intro title_screen main_menu text_window oak_speech naming_screen
# Single files from shared folders, kept at their paths.
FIRERED_GFX_FILES := fonts/latin_normal.png fonts/latin_male.png fonts/latin_small.png fonts/down_arrows.png \
	fonts/down_arrow_3.png fonts/keypad_icons.png interface/std_menu.pal interface/ball/poke.png \
	battle_anims/sprites/particles.png battle_anims/sprites/circle_impact.png \
	pokemon/nidoran_f/front.png pokemon/nidoran_f/normal.pal \
	object_events/pics/people/red_normal.png object_events/pics/people/green_normal.png object_events/palettes/player.pal
# The fonts' glyph widths are data in the game's source, not in the images.
FIRERED_FONTS := Normal:normal Male:male Small:small NormalCopy1:normal_copy_1
NEED_FIRERED = @test -f $(FIRERED)/Makefile || { echo "$(FIRERED) is empty: run git submodule update --init"; exit 1; }

help: ## List commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

env: ## Create .env from .env.example with generated secrets (keeps an existing .env)
	@test -f .env && echo ".env already exists" || ( \
		sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$(openssl rand -hex 24)|" \
		    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$$(openssl rand -hex 24)|" \
		    -e "s|^NATS_MIC_CORE_PASSWORD=.*|NATS_MIC_CORE_PASSWORD=$$(openssl rand -hex 24)|" \
		    -e "s|^NATS_MIC_BATTLES_PASSWORD=.*|NATS_MIC_BATTLES_PASSWORD=$$(openssl rand -hex 24)|" \
		    -e "s|^JWT_PRIVATE_KEY=.*|JWT_PRIVATE_KEY=$$(openssl rand -base64 32)|" \
		    .env.example > .env && echo ".env created: add the Google client ID and secret" )

up: assets ## Build and start the whole stack
	docker compose up --build -d

down: ## Stop the stack (keeps data)
	docker compose down

logs: ## Follow logs
	docker compose logs -f

ps: ## Show service status
	docker compose ps

clean: ## Stop the stack and delete its data volumes
	docker compose down -v

assets: graphics text audio ## FireRed's graphics, text and sounds for the game

graphics: ## Copy FireRed's graphics as they are (drawn with their palettes and tilemaps at runtime)
	$(NEED_FIRERED)
	@mkdir -p $(FIRERED_OUT)/graphics
	@for d in $(FIRERED_GFX); do rm -rf $(FIRERED_OUT)/graphics/$$d && cp -R $(FIRERED)/graphics/$$d $(FIRERED_OUT)/graphics/; done
	@for f in $(FIRERED_GFX_FILES); do mkdir -p $(FIRERED_OUT)/graphics/$$(dirname $$f) && cp $(FIRERED)/graphics/$$f $(FIRERED_OUT)/graphics/$$f; done
	@for font in $(FIRERED_FONTS); do \
		sed -n "/sFont$${font%%:*}LatinGlyphWidths\[\] =/,/};/{/=/d;p;}" $(FIRERED)/src/text.c | tr -cd '0-9,' | sed 's/^/[/; s/,*$$/]/' \
			> $(FIRERED_OUT)/graphics/fonts/latin_$${font##*:}_widths.json; done

text: ## Encode FireRed's text with its charmap (src/game/firered/texts.json lists the strings)
	$(NEED_FIRERED)
	$(RUN) --user "$$(id -u):$$(id -g)" $(NODE_IMAGE) node /repo/infra/text/extract.mjs /repo/$(FIRERED) /repo/spa-pokeuniverse/src/game/firered/texts.json /repo/$(FIRERED_OUT)/text

audio: ## Render FireRed's music, sound effects and cries (docs/audio.md)
	$(NEED_FIRERED)
	@docker build -q -t pokeuniverse-audio infra/audio >/dev/null
	$(RUN) --user "$$(id -u):$$(id -g)" pokeuniverse-audio sh /repo/infra/audio/render.sh

generate: contracts sqlc ## Regenerate all generated code

contracts: ## Lint and generate Protocol Buffers code (Go + TypeScript)
	$(RUN) -w /repo/lib-contracts $(BUF_IMAGE) lint
	$(RUN) -w /repo/lib-contracts $(BUF_IMAGE) generate

sqlc: ## Generate type-safe Go database code
	$(RUN) -w /repo/mic-core $(SQLC_IMAGE) generate

tidy: ## Tidy Go modules
	$(RUN) $(GO_CACHE) -w /repo/lib-contracts $(GO_IMAGE) go mod tidy
	$(RUN) $(GO_CACHE) -w /repo/mic-core $(GO_IMAGE) go mod tidy

lock: ## Update pnpm-lock.yaml after changing a package.json
	$(RUN) -w /repo $(NODE_IMAGE) sh -c "$(PNPM) install --lockfile-only"

breaking: ## Check contracts for breaking changes against main
	$(RUN) -w /repo/lib-contracts $(BUF_IMAGE) breaking --against '/repo/.git#branch=main,subdir=lib-contracts'
