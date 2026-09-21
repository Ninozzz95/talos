import type { ChatTurn } from '@/stores/chat'

/**
 * A conversation that outlived the model which could see.
 *
 * Owner 2026-07-27: he switched a live chat from Opus 5 to DeepSeek and every
 * further message died — the guard fired on ANY image anywhere in the history,
 * so one photo sent an hour earlier poisoned the conversation for good,
 * including messages that had nothing to do with it.
 *
 * You cannot un-send an image, and a past picture must not be a life sentence
 * for the chat. So the history is adapted rather than refused: the picture goes
 * and a line takes its place, because a model that is quietly handed a
 * conversation with a hole in it will answer as though it had seen something.
 *
 * The message being sent RIGHT NOW is a different matter and is still refused
 * upstream — attaching a photo to a model that cannot see is worth being told
 * about before paying for a reply about nothing.
 */
export interface TalosVisionFallback {
    turns: ChatTurn[]
    /** How many images had to go, for the note the user is shown. */
    dropped: number
}

const REPLACEMENT = '[An image was here. The current model cannot see images, so it was left out.]'

export function adaptTurnsForTextOnlyModel(turns: readonly ChatTurn[]): TalosVisionFallback {
    let dropped = 0
    const adapted = turns.map((turn) => {
        if (!turn.parts?.some((part) => part.type === 'image')) return turn
        const parts = turn.parts.filter((part) => {
            if (part.type !== 'image') return true
            dropped += 1
            return false
        })
        return {
            ...turn,
            // The text that travelled with the picture is kept: it is usually
            // the question, and dropping it would remove the point of the turn.
            parts: [...parts, { type: 'text' as const, text: REPLACEMENT }],
        }
    })
    return { turns: dropped === 0 ? [...turns] : adapted, dropped }
}
