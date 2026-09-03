import { describe, expect, it } from 'vitest'
import { ForgeCircuitBreaker } from '@/lib/tools/dynamic/circuitBreaker'

/**
 * ⛔⛔ Owner 2026-08-27 — questo file era codice morto (mai importato da
 * `interpreter.ts`) e senza mezzo stato: dopo il cooldown QUALSIASI
 * numero di chiamate passava subito tutte insieme, e un fallimento
 * doveva riaccumulare l'intera soglia da zero. Questi test provano la
 * macchina a stati CLOSED → OPEN → HALF-OPEN (un solo probe) → CLOSED
 * o di nuovo OPEN, come da letteratura (Fowler/Resilience4j).
 *
 * Margine generoso (+1000ms), non un'uguaglianza al millisecondo esatto
 * col cooldown: la prima versione di questi test calcolava
 * `afterCooldown` dal tempo INIZIALE anziché dal timestamp dell'ULTIMO
 * fallimento (quello che davvero fissa `openUntil`), e falliva per un
 * solo millisecondo di scarto — un bug del test, non del breaker.
 */
const COOLDOWN_MS = 30 * 60_000

describe('ForgeCircuitBreaker', () => {
    it('resta chiuso finché i fallimenti non raggiungono la soglia', () => {
        const breaker = new ForgeCircuitBreaker(3, 10 * 60_000, COOLDOWN_MS)
        const t0 = 1_000_000
        breaker.failure('cap', t0)
        breaker.failure('cap', t0 + 1)
        expect(breaker.canRun('cap', t0 + 2)).toBe(true)
    })

    it('si apre alla soglia e rifiuta finché il cooldown non scade', () => {
        const breaker = new ForgeCircuitBreaker(2, 10 * 60_000, COOLDOWN_MS)
        const t0 = 1_000_000
        breaker.failure('cap', t0)
        const lastFailureAt = t0 + 1
        breaker.failure('cap', lastFailureAt)
        expect(breaker.canRun('cap', lastFailureAt + 2)).toBe(false)
        expect(breaker.canRun('cap', lastFailureAt + COOLDOWN_MS - 1000)).toBe(false)
    })

    it('half-open: concede ESATTAMENTE un probe, non tutte le chiamate insieme', () => {
        const breaker = new ForgeCircuitBreaker(2, 10 * 60_000, COOLDOWN_MS)
        const t0 = 1_000_000
        breaker.failure('cap', t0)
        const lastFailureAt = t0 + 1
        breaker.failure('cap', lastFailureAt)
        const afterCooldown = lastFailureAt + COOLDOWN_MS + 1000
        expect(breaker.canRun('cap', afterCooldown)).toBe(true) // il probe
        expect(breaker.canRun('cap', afterCooldown + 1)).toBe(false) // niente altro finché il probe non risolve
    })

    it('un probe half-open riuscito richiude il circuito', () => {
        const breaker = new ForgeCircuitBreaker(2, 10 * 60_000, COOLDOWN_MS)
        const t0 = 1_000_000
        breaker.failure('cap', t0)
        const lastFailureAt = t0 + 1
        breaker.failure('cap', lastFailureAt)
        const afterCooldown = lastFailureAt + COOLDOWN_MS + 1000
        expect(breaker.canRun('cap', afterCooldown)).toBe(true)
        breaker.success('cap')
        expect(breaker.canRun('cap', afterCooldown + 2)).toBe(true)
        expect(breaker.canRun('cap', afterCooldown + 3)).toBe(true) // davvero chiuso, non un altro half-open
    })

    it('un probe half-open fallito riapre SUBITO — non riaccumula la soglia da zero', () => {
        const breaker = new ForgeCircuitBreaker(3, 10 * 60_000, COOLDOWN_MS)
        const t0 = 1_000_000
        breaker.failure('cap', t0)
        breaker.failure('cap', t0 + 1)
        const lastFailureAt = t0 + 2
        breaker.failure('cap', lastFailureAt) // soglia 3 raggiunta, apre
        const afterCooldown = lastFailureAt + COOLDOWN_MS + 1000
        expect(breaker.canRun('cap', afterCooldown)).toBe(true) // probe concesso
        breaker.failure('cap', afterCooldown + 1) // il probe fallisce: UN solo fallimento, non tre
        expect(breaker.canRun('cap', afterCooldown + 2)).toBe(false) // riaperto subito
    })

    it('capability diverse hanno stato indipendente', () => {
        const breaker = new ForgeCircuitBreaker(1, 10 * 60_000, COOLDOWN_MS)
        const t0 = 1_000_000
        breaker.failure('a', t0)
        expect(breaker.canRun('a', t0 + 1)).toBe(false)
        expect(breaker.canRun('b', t0 + 1)).toBe(true)
    })
})
