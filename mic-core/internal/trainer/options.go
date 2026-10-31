package trainer

import (
	"io"
	"net/http"

	"google.golang.org/protobuf/encoding/protojson"

	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/db"
)

// maxFrame is FireRed's number of window frames (TYPE1 to TYPE10).
const maxFrame = 10

// maxOptionsBody bounds an Options request: five enums and a number.
const maxOptionsBody = 1 << 9

// Each option as the contract's enum and as its column's value.
var (
	textSpeeds   = names[trainerv1.TextSpeed]{trainerv1.TextSpeed_TEXT_SPEED_SLOW: "slow", trainerv1.TextSpeed_TEXT_SPEED_MID: "mid", trainerv1.TextSpeed_TEXT_SPEED_FAST: "fast"}
	battleScenes = names[trainerv1.BattleScene]{trainerv1.BattleScene_BATTLE_SCENE_ON: "on", trainerv1.BattleScene_BATTLE_SCENE_OFF: "off"}
	battleStyles = names[trainerv1.BattleStyle]{trainerv1.BattleStyle_BATTLE_STYLE_SHIFT: "shift", trainerv1.BattleStyle_BATTLE_STYLE_SET: "set"}
	soundModes   = names[trainerv1.SoundMode]{trainerv1.SoundMode_SOUND_MODE_MONO: "mono", trainerv1.SoundMode_SOUND_MODE_STEREO: "stereo"}
	buttonModes  = names[trainerv1.ButtonMode]{trainerv1.ButtonMode_BUTTON_MODE_HELP: "help", trainerv1.ButtonMode_BUTTON_MODE_LR: "lr", trainerv1.ButtonMode_BUTTON_MODE_L_EQUALS_A: "l_equals_a"}
)

// names maps an enum's values to the column's; values missing from it are invalid.
type names[E comparable] map[E]string

func (n names[E]) value(name string) E {
	for e, s := range n {
		if s == name {
			return e
		}
	}
	var zero E
	return zero
}

// putOptions saves the OPTION menu's choices as it closes. The same options twice are the same
// result, so the client retries until they are saved.
func (h *Handler) putOptions(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxOptionsBody))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req trainerv1.Options
	if err := protojson.Unmarshal(body, &req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	params, ok := optionsParams(p.AccountID, &req)
	if !ok {
		http.Error(w, "invalid options", http.StatusUnprocessableEntity)
		return
	}
	n, err := db.New(h.Pool).UpdateTrainerOptions(r.Context(), params)
	if err != nil {
		h.Log.Error("put options", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if n == 0 {
		http.Error(w, "no trainer", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// optionsParams checks that every option is set to one of its values.
func optionsParams(accountID int64, o *trainerv1.Options) (db.UpdateTrainerOptionsParams, bool) {
	textSpeed, ok1 := textSpeeds[o.TextSpeed]
	battleScene, ok2 := battleScenes[o.BattleScene]
	battleStyle, ok3 := battleStyles[o.BattleStyle]
	sound, ok4 := soundModes[o.Sound]
	buttonMode, ok5 := buttonModes[o.ButtonMode]
	ok := ok1 && ok2 && ok3 && ok4 && ok5 && o.Frame >= 1 && o.Frame <= maxFrame
	return db.UpdateTrainerOptionsParams{
		AccountID:   accountID,
		TextSpeed:   textSpeed,
		BattleScene: battleScene,
		BattleStyle: battleStyle,
		Sound:       sound,
		ButtonMode:  buttonMode,
		Frame:       int16(o.Frame),
	}, ok
}

func options(row db.GetTrainerRow) *trainerv1.Options {
	return &trainerv1.Options{
		TextSpeed:   textSpeeds.value(row.TextSpeed),
		BattleScene: battleScenes.value(row.BattleScene),
		BattleStyle: battleStyles.value(row.BattleStyle),
		Sound:       soundModes.value(row.Sound),
		ButtonMode:  buttonModes.value(row.ButtonMode),
		Frame:       uint32(row.Frame),
	}
}
