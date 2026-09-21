import { describe, expect, it } from 'vitest'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'

/**
 * Owner 2026-07-26: "metti anche un pulsante per selezionare massivamente media
 * e chat per eliminazione".
 *
 * Two surfaces (the Library grid and the chat list) with the same behaviour, so
 * the behaviour lives once. What varies is the markup; what must not vary is
 * when the mode ends, because a selection mode you cannot leave — or one that
 * silently outlives the list it selected from — is how people delete the wrong
 * thing.
 */
describe('selecting many things to delete', () => {
    it('starts off, and starts empty', () => {
        const selection = useTalosBulkSelection()
        expect(selection.active.value).toBe(false)
        expect(selection.count.value).toBe(0)
    })

    it('turning it on with a row selects that row', () => {
        // Entering via long-press should not cost a second tap to select the
        // thing the user was already pressing.
        const selection = useTalosBulkSelection()
        selection.enter('a')
        expect(selection.active.value).toBe(true)
        expect(selection.isSelected('a')).toBe(true)
        expect(selection.count.value).toBe(1)
    })

    it('turning it on from a button selects nothing', () => {
        const selection = useTalosBulkSelection()
        selection.enter()
        expect(selection.active.value).toBe(true)
        expect(selection.count.value).toBe(0)
    })

    it('toggles rows and reports them in a stable order', () => {
        const selection = useTalosBulkSelection()
        selection.enter()
        selection.toggle('b')
        selection.toggle('a')
        selection.toggle('b')
        expect(selection.ids.value).toEqual(['a'])
    })

    it('select-all is a toggle against the list it is given', () => {
        const selection = useTalosBulkSelection()
        selection.enter()
        selection.selectAll(['a', 'b', 'c'])
        expect(selection.allSelected(['a', 'b', 'c'])).toBe(true)
        expect(selection.count.value).toBe(3)
        selection.selectAll(['a', 'b', 'c'])
        expect(selection.count.value).toBe(0)
    })

    it('forgets rows that no longer exist', () => {
        // Delete 3 of 5, and the mode stays on for the rest — but the ids of the
        // deleted rows must not linger and get counted, or "2 selected" turns
        // into a delete of something the user cannot see.
        const selection = useTalosBulkSelection()
        selection.enter()
        selection.selectAll(['a', 'b', 'c'])
        selection.reconcile(['b'])
        expect(selection.ids.value).toEqual(['b'])
    })

    it('leaves the mode when the last selected row is gone', () => {
        const selection = useTalosBulkSelection()
        selection.enter('a')
        selection.reconcile([])
        expect(selection.active.value).toBe(false)
    })

    it('exits clean, so the next time starts from nothing', () => {
        const selection = useTalosBulkSelection()
        selection.enter('a')
        selection.exit()
        expect(selection.active.value).toBe(false)
        expect(selection.count.value).toBe(0)
        expect(selection.isSelected('a')).toBe(false)
    })

    it('ignores everything while it is off', () => {
        // A stray toggle from a row that did not notice the mode ended must not
        // build up an invisible selection.
        const selection = useTalosBulkSelection()
        selection.toggle('a')
        selection.selectAll(['a', 'b'])
        expect(selection.count.value).toBe(0)
    })
})
