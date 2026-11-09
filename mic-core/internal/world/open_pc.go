package world

import "time"

// pcKeptFor is how long a PC left open by a dropped connection stays open for the same page.
const pcKeptFor = time.Minute

// openPC is a PC menu a dropped connection left open: the client still shows it, so the same
// page reconnecting where it was finds it open (its box actions aren't refused).
type openPC struct {
	instance           string
	m                  string
	at                 Point
	script, lastScript uint32
	left               time.Time
}

// leftPC is the PC p leaves open, if any (on p's zone).
func (p *Player) leftPC(now time.Time) (openPC, bool) {
	if !p.atPC() {
		return openPC{}, false
	}
	return openPC{instance: p.instance, m: p.zone.m.ID, at: p.pos, script: p.script, lastScript: p.lastScript, left: now}, true
}

// reopenPC opens again the PC p's page left open, when it reconnects in time where it was
// (w.mu held, before p is in its zone).
func (w *World) reopenPC(p *Player, m string, now time.Time) {
	pc, ok := w.openPCs[p.accountID]
	if !ok {
		return
	}
	delete(w.openPCs, p.accountID)
	if pc.instance == p.instance && pc.m == m && pc.at == p.pos && now.Sub(pc.left) < pcKeptFor {
		p.script, p.pcScript, p.lastScript = pc.script, pc.script, max(p.lastScript, pc.lastScript)
	}
}
