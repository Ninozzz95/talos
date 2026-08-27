import { describe, expect, it } from 'vitest'
import { forgePathViolation, getPath, setPath } from '@/lib/tools/dynamic/expr'

/**
 * ⛔⛔ Owner 2026-08-27 — la prototype pollution era CONFERMATA leggendo
 * `expr.ts` prima di questo fix: `setPath`/`getPath` indicizzavano
 * `current[part]` senza nessun controllo sui segmenti. Questi test
 * riproducono esattamente l'attacco e provano ENTRAMBE le difese
 * indipendenti — la grammatica (rifiuta) e `Object.create(null)`
 * (anche se qualcosa sfuggisse, non c'è un `__proto__` accessor da
 * invocare) — e la prova del verso contrario: un path normale non deve
 * mai essere respinto.
 */
describe('Tool Forge — grammatica di path sicura (prototype pollution)', () => {
    it('rifiuta un path che tenta __proto__, e Object.prototype resta pulito', () => {
        const before = ({} as Record<string, unknown>).polluted
        expect(() => setPath({}, '__proto__.polluted', 'evil')).toThrow('TALOS_FORGE_PATH_UNSAFE')
        // La prova del contrario: l'attacco non deve aver lasciato traccia,
        // nemmeno quando il throw arriva DOPO che qualche segmento fosse
        // già stato consumato.
        expect(({} as Record<string, unknown>).polluted).toBe(before)
        expect(before).toBeUndefined()
    })

    it('rifiuta constructor/prototype/i getter-setter magici, non solo __proto__', () => {
        for (const dangerous of ['constructor.prototype.polluted', 'a.__defineGetter__', 'a.__lookupSetter__']) {
            expect(() => setPath({}, dangerous, 'evil')).toThrow('TALOS_FORGE_PATH_UNSAFE')
        }
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it('getPath rifiuta gli stessi path pericolosi di setPath — difesa simmetrica', () => {
        expect(() => getPath({}, '__proto__.polluted')).toThrow('TALOS_FORGE_PATH_UNSAFE')
    })

    it('forgePathViolation NON lancia: dà una ragione o null, per un diagnostico pulito', () => {
        expect(forgePathViolation('__proto__.x')).toMatch(/forbidden/)
        expect(forgePathViolation('$.notes.title')).toBeNull()
    })

    it('prova del contrario: un path legittimo normale non viene mai respinto', () => {
        expect(forgePathViolation('$.notes.title')).toBeNull()
        expect(forgePathViolation('item')).toBeNull()
        expect(forgePathViolation('items.0.name')).toBeNull()
        const target: Record<string, unknown> = {}
        expect(() => setPath(target, '$.notes.title', 'ciao')).not.toThrow()
        expect(getPath(target, '$.notes.title')).toBe('ciao')
    })

    it('seconda difesa indipendente: anche un contenitore creato da setPath non ha prototipo scrivibile', () => {
        const target: Record<string, unknown> = {}
        setPath(target, 'a.b.c', 1)
        const inner = target.a as Record<string, unknown>
        expect(Object.getPrototypeOf(inner)).toBeNull()
    })

    it('rifiuta segmenti troppo lunghi e path troppo profondi (limiti, non solo denylist)', () => {
        expect(forgePathViolation('a'.repeat(65))).toMatch(/exceeds 64 characters/)
        expect(forgePathViolation(Array.from({ length: 17 }, () => 'a').join('.'))).toMatch(/exceeds 16 segments/)
    })

    it('rifiuta caratteri fuori dall\'allowlist (spazi, punti impliciti, simboli)', () => {
        expect(forgePathViolation('a b')).toMatch(/alphanumeric/)
        expect(forgePathViolation('a$b')).toMatch(/alphanumeric/)
    })
})
