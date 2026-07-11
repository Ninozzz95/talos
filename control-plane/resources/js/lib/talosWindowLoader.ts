export type TalosWindowLoaderStatus = 'idle' | 'loading' | 'success' | 'error'

export interface TalosWindowLoaderState<T> {
    status: TalosWindowLoaderStatus
    value: T | null
    error: unknown | null
}

export type TalosWindowLoaderListener<T> = (state: TalosWindowLoaderState<T>) => void

export interface TalosWindowLoader<T> {
    readonly state: TalosWindowLoaderState<T>
    load(): Promise<T>
    retry(): Promise<T>
    subscribe(listener: TalosWindowLoaderListener<T>): () => void
}

export function createTalosWindowLoader<T>(loadWindow: () => Promise<T>): TalosWindowLoader<T> {
    const state: TalosWindowLoaderState<T> = {
        status: 'idle',
        value: null,
        error: null,
    }
    const listeners = new Set<TalosWindowLoaderListener<T>>()
    let attempt = 0
    let activePromise: Promise<T> | null = null
    let retryPromise: Promise<T> | null = null

    const notify = () => {
        for (const listener of listeners) {
            listener(state)
        }
    }

    const beginAttempt = (): Promise<T> => {
        const currentAttempt = ++attempt
        state.status = 'loading'
        state.value = null
        state.error = null
        notify()

        let request: Promise<T>
        try {
            request = loadWindow()
        } catch (error) {
            request = Promise.reject(error)
        }

        const promise = request.then(
            (value) => {
                if (currentAttempt === attempt) {
                    state.status = 'success'
                    state.value = value
                    state.error = null
                    activePromise = null
                    notify()
                }

                return value
            },
            (error: unknown) => {
                if (currentAttempt === attempt) {
                    state.status = 'error'
                    state.value = null
                    state.error = error
                    activePromise = null
                    notify()
                }

                throw error
            },
        )

        activePromise = promise
        return promise
    }

    const load = (): Promise<T> => {
        if (state.status === 'success') {
            return Promise.resolve(state.value as T)
        }

        if (state.status === 'error') {
            return Promise.reject(state.error)
        }

        return activePromise ?? beginAttempt()
    }

    const retry = (): Promise<T> => {
        if (retryPromise) {
            return retryPromise
        }

        const promise = beginAttempt()
        retryPromise = promise
        promise.then(
            () => {
                if (retryPromise === promise) {
                    retryPromise = null
                }
            },
            () => {
                if (retryPromise === promise) {
                    retryPromise = null
                }
            },
        )
        return promise
    }

    return {
        state,
        load,
        retry,
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
    }
}
