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

    it('formats canonical labels without inventing vocabulary', () => {
        expect(mobileEffortLabel('off')).toBe('Off')
        expect(mobileEffortLabel('xhigh')).toBe('Xhigh')
    })
})
