import type { FastifyReply, FastifyRequest } from 'fastify'

import { ArtifactWorkerFault } from '../errors.js'

export interface RequestLifecycleLease {
  readonly signal: AbortSignal
  finish(): void
}

export function settleWithinRequestLifecycle<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const settle = (callback: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = (): void => {
      settle(() => reject(
        signal.reason ?? new DOMException('Request lifecycle aborted', 'AbortError'),
      ))
    }

    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
    operation.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    )
  })
}

export function beginRequestLifecycle(
  request: FastifyRequest['raw'],
  response: FastifyReply['raw'],
  handlerTimeoutMs: number,
): RequestLifecycleLease {
  if (!Number.isSafeInteger(handlerTimeoutMs) || handlerTimeoutMs <= 0) {
    throw new Error('Request lifecycle timeout must be a positive integer')
  }

  const controller = new AbortController()
  const abortForDisconnect = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('HTTP client disconnected', 'AbortError'))
    }
  }
  const onRequestClose = (): void => {
    if (request.aborted) {
      abortForDisconnect()
    }
  }
  const onResponseClose = (): void => {
    if (!response.writableEnded) {
      abortForDisconnect()
    }
  }
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new ArtifactWorkerFault(
        'ARTIFACT_HANDLER_TIMEOUT',
        'Artifact generation exceeded the worker handler timeout',
        { statusCode: 503 },
      ))
    }
  }, handlerTimeoutMs)
  timer.unref()

  request.on('close', onRequestClose)
  response.on('close', onResponseClose)
  if (request.aborted) {
    abortForDisconnect()
  }

  let finished = false
  return {
    signal: controller.signal,
    finish: () => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      request.off('close', onRequestClose)
      response.off('close', onResponseClose)
    },
  }
}
