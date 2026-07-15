export type TalosCollectionState = 'idle' | 'loading' | 'error' | 'empty' | 'ready'

export function resolveTalosCollectionState(input: {
    itemCount: number
    loading: boolean
    error: string | null | undefined
    requested?: boolean
}): TalosCollectionState {
    if (input.itemCount > 0) return 'ready'
    if (input.loading) return 'loading'
    if (input.error) return 'error'
    if (input.requested === false) return 'idle'
    return 'empty'
}
