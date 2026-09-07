import { ArtifactWorkerFault } from '../errors.js'

interface RegistryEntry {
  controller: AbortController
  leaseId: symbol
  parentAbortListener?: () => void
  parentSignal?: AbortSignal
  timer: NodeJS.Timeout
}

interface GenerationLease {
  readonly requestId: string
  readonly signal: AbortSignal
  finish(): void
}

export class GenerationRegistry {
  readonly #entries = new Map<string, RegistryEntry>()
  readonly #maxConcurrentGenerations: number

  constructor(maxConcurrentGenerations = 2) {
    if (!Number.isSafeInteger(maxConcurrentGenerations) || maxConcurrentGenerations <= 0) {
      throw new Error('Maximum concurrent artifact generations must be a positive integer')
    }
    this.#maxConcurrentGenerations = maxConcurrentGenerations
  }

  get size(): number {
    return this.#entries.size
  }

  begin(requestId: string, timeoutMs: number, parentSignal?: AbortSignal): GenerationLease {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_INVALID_REQUEST',
        'Generation timeout must be a positive integer',
      )
    }
    if (this.#entries.has(requestId)) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_REQUEST_ACTIVE',
        'An artifact request with this identifier is already active',
        { statusCode: 409 },
      )
    }
    if (this.#entries.size >= this.#maxConcurrentGenerations) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_CAPACITY_EXCEEDED',
        'Artifact worker generation capacity is exhausted',
        { statusCode: 503 },
      )
    }

    const controller = new AbortController()
    const leaseId = Symbol(requestId)
    const timer = setTimeout(() => {
      controller.abort(new DOMException('Artifact generation timed out', 'TimeoutError'))
    }, timeoutMs)
    timer.unref()

    const entry: RegistryEntry = { controller, leaseId, timer }
    if (parentSignal !== undefined) {
      const parentAbortListener = (): void => {
        controller.abort(parentSignal.reason)
      }
      entry.parentSignal = parentSignal
      entry.parentAbortListener = parentAbortListener
      if (parentSignal.aborted) {
        parentAbortListener()
      } else {
        parentSignal.addEventListener('abort', parentAbortListener, { once: true })
      }
    }
    this.#entries.set(requestId, entry)

    let finished = false
    return {
      requestId,
      signal: controller.signal,
      finish: () => {
        if (finished) {
          return
        }
        finished = true
        const current = this.#entries.get(requestId)
        if (current?.leaseId !== leaseId) {
          return
        }
        clearTimeout(current.timer)
        if (current.parentSignal !== undefined && current.parentAbortListener !== undefined) {
          current.parentSignal.removeEventListener('abort', current.parentAbortListener)
        }
        this.#entries.delete(requestId)
      },
    }
  }

  cancel(requestId: string): boolean {
    const entry = this.#entries.get(requestId)
    if (entry === undefined) {
      return false
    }
    entry.controller.abort(new DOMException('Artifact generation was cancelled', 'AbortError'))
    return true
  }

  cancelAll(): void {
    for (const requestId of this.#entries.keys()) {
      this.cancel(requestId)
    }
  }
}
