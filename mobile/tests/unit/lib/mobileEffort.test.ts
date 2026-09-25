import { describe, expect, it } from 'vitest'
import {
    clampMobileEffort,
    mobileEffortLabel,
    mobileEffortLadderFromLevels,
} from '@/lib/mobileEffort'

describe('mobile effort presentation contract', () => {
    it('orders and deduplicates only supported levels with one implicit off', () => {
        expect(mobileEffortLadderFromLevels([
            'high',
            'bogus',
            'low',
            'medium',
            'low',
            'xhigh',
            'off',
        ])).toEqual(['off', 'low', 'medium', 'high', 'xhigh'])
    })

    it('returns only off for an empty or invalid capability list', () => {
        expect(mobileEffortLadderFromLevels([])).toEqual(['off'])
        expect(mobileEffortLadderFromLevels(['turbo', ''])) .toEqual(['off'])
        expect(mobileEffortLadderFromLevels(null)).toEqual(['off'])
    })

    it('clamps stale effort after a model change', () => {
        expect(clampMobileEffort(['low', 'medium', 'high'], 'medium')).toBe('medium')
        expect(clampMobileEffort(['low', 'medium', 'high'], 'max')).toBe('high')
        expect(clampMobileEffort(['minimal', 'low'], 'max')).toBe('low')
        expect(clampMobileEffort([], 'high')).toBe('off')
    })

    /**
     * RAG-OBB (24/09/2026, owner «cura 1»): GLM 5.3 ragiona per forza. OpenRouter lo dichiara nel catalogo
     * (`reasoning.mandatory`, «hide disable controls», https://openrouter.ai/docs/use-cases/reasoning-tokens):
     * con «off» la richiesta partiva senza `reasoning` e un fornitore ha scritto il ragionamento nella risposta.
     */
    it('RAG-OBB-01 hides off when the model reasons by mandate', () => {
        expect(mobileEffortLadderFromLevels(['max', 'high', 'low'], { mandatory: true })).toEqual(['low', 'high', 'max'])
        expect(mobileEffortLadderFromLevels(['max', 'high', 'low'], { mandatory: false })).toEqual(['off', 'low', 'high', 'max'])
    })

    it('RAG-OBB-02 degrades an unsupported effort to the nearest weaker level, never to off (Hermes clamp_effort)', () => {
        expect(clampMobileEffort(['max', 'high', 'low'], 'off', { mandatory: true })).toBe('low')
        expect(clampMobileEffort(['max', 'high', 'low'], 'medium', { mandatory: true })).toBe('low')
        expect(clampMobileEffort(['max', 'high', 'low'], 'xhigh', { mandatory: true })).toBe('high')
        expect(clampMobileEffort(['max', 'high', 'low'], 'minimal', { mandatory: true })).toBe('low')
        expect(clampMobileEffort(['low', 'medium', 'high'], 'minimal')).toBe('low')
        expect(clampMobileEffort(['low', 'medium', 'high'], 'off')).toBe('off')
    })

    it('formats canonical labels without inventing vocabulary', () => {
        expect(mobileEffortLabel('off')).toBe('Off')
        expect(mobileEffortLabel('xhigh')).toBe('Xhigh')
    })
})
