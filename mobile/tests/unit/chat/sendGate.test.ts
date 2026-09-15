import { describe, expect, it } from 'vitest'
import { createTalosSendGate } from '@/lib/chat/sendGate'

/**
 * Owner 2026-07-27, with the transcript to prove it:
 *
 *   09:31:29  USER  Riesci a cambiare il colore del pelo? Da nero a bianco?
 *   09:32:01  USER  Riesci a cambiare il colore del pelo? Da nero a bianco?
 *
 * The same message sent twice. He noticed it happens around taking focus off
 * the composer, which fits: the only guard was `props.sending`, and that flag
 * is raised by the PARENT after the emit. Between the emit and the prop coming
 * back down there is a window where a second event — a blur that produces an
 * extra click, a fast double tap — passes the guard untouched, and the owner
 * pays for two answers.
 *
 * The latch has to close SYNCHRONOUSLY, on the same tick as the emit. And it
 * has to reopen even when nothing comes back, or the composer becomes a dead
 * box — the same trap as the delete dialog that had to be force-killed.
 */
describe('sending once, even when the tap arrives twice', () => {
    it('lets the first send through', () => {
        const gate = createTalosSendGate({ now: () => 0 })
        expect(gate.claim(0)).toBe(true)
    })

    it('refuses a second send in the same instant', () => {
        const gate = createTalosSendGate({ now: () => 0 })
        gate.claim(0)
        expect(gate.claim(0)).toBe(false)
    })

    it('opens again once the answer that was asked for has finished', () => {
        const gate = createTalosSendGate({ now: () => 0 })
        gate.claim(0)
        gate.observeSending(true)
        expect(gate.claim(0)).toBe(false)
        gate.observeSending(false)
        expect(gate.claim(0)).toBe(true)
    })

    it('opens again when the send never even started', () => {
        // A refusal upstream leaves `sending` false forever. Without this the
        // composer would be locked for the rest of the session, which is worse
        // than the bug being fixed.
        const gate = createTalosSendGate({ now: () => 0, graceMs: 1_500 })
        expect(gate.claim(0)).toBe(true)
        expect(gate.claim(500)).toBe(false)
        expect(gate.claim(1_600)).toBe(true)
    })

    it('does not open on the grace period while the answer is still coming', () => {
        // Long answers are normal: a two-minute reply must not unlatch and let
        // a stray tap send the same prompt again.
        const gate = createTalosSendGate({ now: () => 0, graceMs: 1_500 })
        gate.claim(0)
        gate.observeSending(true)
        expect(gate.claim(60_000)).toBe(false)
    })

    it('is not confused by a sending flag that was already true', () => {
        const gate = createTalosSendGate({ now: () => 0 })
        gate.observeSending(true)
        gate.observeSending(false)
        expect(gate.claim(0)).toBe(true)
    })
})
