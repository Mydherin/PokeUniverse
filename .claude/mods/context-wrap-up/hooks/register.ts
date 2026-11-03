import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Stage } from '../types'

const LIMIT_PERCENT = 20
const PROMPT =
  'Finish in progress task and update proper milestone file to track the progression and remaining tasks leaving it ready for a new fresh start really efficient'

const stage = atom({ plugin: 'context-wrap-up', key: 'stage' } as const, 'armed' as Stage)

const setStage = ($: EngineInterface, value: Stage) => update($, stage, () => value)

const isOverLimit = async ($: EngineInterface) => {
  const { context } = await $.session.usage()

  return (context.percent ?? 0) > LIMIT_PERCENT
}

export const register: Register = on => {
  // Mid-turn: a submitted prompt would wait for the whole turn to end, so the
  // prompt joins the conversation as a row the next request reads.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const current = await read($, stage)

      if (current === 'noted') {
        await setStage($, 'sent')
      } else if (!(await isOverLimit($))) {
        if (current !== 'armed') await setStage($, 'armed')
      } else if (current === 'armed') {
        await setStage($, 'noted')
        await $.session.append({
          message: { type: 'user', content: [{ type: 'text', text: PROMPT }] },
        })
        $.ui.toast(`Context over ${LIMIT_PERCENT}%: asked Claude to wrap up`)
      }
    }

    return yield* next(e)
  })

  // The turn's last response went over, or ended before reading the row: only
  // a prompt of its own reaches the model now.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined && !e.isAborted) {
      const current = await read($, stage)

      if (current === 'noted' || (current === 'armed' && (await isOverLimit($)))) {
        await setStage($, 'sent')
        void $.prompt.submit({ text: PROMPT, asUser: true })
      }
    }

    return result
  })
}
