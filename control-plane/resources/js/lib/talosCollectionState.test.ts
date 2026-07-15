import { describe, expect, it } from 'vitest'
import { resolveTalosCollectionState } from './talosCollectionState'

describe('resolveTalosCollectionState', () => {
    it('never reports an empty collection while the initial request is loading or failed', () => {
        expect(resolveTalosCollectionState({ itemCount: 0, loading: false, error: null, requested: false })).toBe('idle')
        expect(resolveTalosCollectionState({ itemCount: 0, loading: true, error: null })).toBe('loading')
        expect(resolveTalosCollectionState({ itemCount: 0, loading: false, error: 'Unavailable' })).toBe('error')
        expect(resolveTalosCollectionState({ itemCount: 0, loading: false, error: null })).toBe('empty')
        expect(resolveTalosCollectionState({ itemCount: 2, loading: true, error: null })).toBe('ready')
        expect(resolveTalosCollectionState({ itemCount: 2, loading: false, error: 'Refresh failed' })).toBe('ready')
    })
})
