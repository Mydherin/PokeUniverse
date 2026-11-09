// armed: under the limit. noted: told mid-turn, the model hasn't read it yet.
// sent: the model has it; stays so until the context drops under the limit.
export type Stage = 'armed' | 'noted' | 'sent'

declare module 'claude-code' {
  interface PluginState {
    'context-wrap-up': { stage: Stage }
  }
}
