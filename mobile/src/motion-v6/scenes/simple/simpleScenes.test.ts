/**
 * ⭐⭐⭐ "SIMPLE" SUL MOTORE COMPLEX, PROVATO NEI DUE VERSI — 2026-08-23.
 *
 * ⛔⛔ Non basta che `npm run typecheck` sia verde: il tipo di `SceneInstance`
 * è un discriminante che TypeScript controlla solo a compile-time (verificato
 * cercando "TypeScript discriminated union runtime" — il check vero vive in
 * `stageController.ts`, `isSceneInstance()`, che guarda `Reflect.ownKeys` a
 * runtime). Questi test provano che l'istanza vera — non solo il tipo — porta
 * `kind: 'simple'` come proprietà PROPRIA, con ESATTAMENTE le sette chiavi che
 * `isSceneInstance` si aspetta: se `asSimpleFactory` in `./index.ts` si
 * rompesse tornando a un cast invece che a una ricostruzione, questi test
 * lo direbbero, il typecheck da solo no.
 *
 * ⛔ Il verso contrario è il punto: una factory 'complex' NON adattata deve
 * restare `kind:'complex'`. Senza quel confronto, un adattatore che non fa
 * niente supererebbe lo stesso i test.
 */
import { describe, expect, it } from 'vitest'
import { TALOS_MOTION_SCENE_IDS } from '../../contracts'
import type { SceneInput } from '../../sceneRegistry'
import { createSceneRegistry } from '../../sceneRegistry'
import { createComplexSceneFactory } from '../../renderers/complexRenderer'
import { TALOS_COMPLEX_SCENE_DEFINITIONS } from '../complexAsSimple'
import { createTalosSimpleSceneRegistrations, createTalosStaticSceneRegistrations } from './index'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (base: string, accent: string) => Object.fromEntries(roles.map((role, index) => [role, index >= 8 ? accent : base])) as SceneInput['palette']['light']

function input(tier: 'low'|'balanced'|'high' = 'balanced', colorMode: 'light'|'dark' = 'dark', width = 1200): SceneInput {
    return {
        colorMode,
        palette: { light: palette('#f8fafc', '#2563eb'), dark: palette('#101820', '#d49a52') },
        viewport: { width, height: width < 600 ? 720 : 800, pixelRatio: 1 },
        seed: 137,
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
        effectiveQuality: { tier, fpsCap: tier === 'high' ? 45 : tier === 'low' ? 20 : 30, dprCap: tier === 'high' ? 1.5 : tier === 'low' ? 1 : 1.25, densityScale: tier === 'high' ? 1.25 : tier === 'low' ? 0.55 : 1 },
    }
}

/*
 * ⛔ Un Proxy, non un elenco a mano: `setLineDash` mancava alla prima stesura
 * e ha fatto fallire il test — la prova che `asSimpleFactory` disegna
 * DAVVERO con `sceneTools.ts` di `complexAsSimple` (14 temi, superficie
 * grande). Elencare ogni metodo Canvas2D a mano è la stessa cecità del
 * "l'ho riletto e sembrava a posto": qui si prova che disegna, non si
 * indovina quali metodi userà.
 */
function fakeContext() {
    return new Proxy({}, {
        get: (_target, property) => {
            if (property === 'createLinearGradient' || property === 'createRadialGradient') {
                return () => ({ addColorStop: () => {} })
            }
            return () => {}
        },
    })
}

/*
 * ⛔ Stessa piattaforma finta di `complexAsSimple/complexScenes.test.ts`, e
 * per lo stesso motivo: `createComplexSceneFactory` valida la piattaforma
 * con `strictRecord(platform, PLATFORM_KEYS, PLATFORM_KEYS)` — ESATTAMENTE
 * queste sei chiavi, nessuna in più. La prima stesura aggiungeva `_surfaces`
 * per contare le surface create, ed è bastato per far esplodere tutti e
 * cinque i test con "Unknown or symbolic property": la stessa guardia
 * stretta di `isSceneInstance`, sul lato della piattaforma invece che
 * dell'istanza. Il conteggio ora vive in una chiusura esterna, non su una
 * chiave in più dell'oggetto.
 */
function complexPlatform() {
    const callbacks: Array<() => void> = []
    const context = fakeContext()
    const surfaces: unknown[] = []
    const plat = {
        scheduler: {
            now: () => 0,
            requestFrame: (callback: () => void) => { callbacks.push(callback); return callback },
            cancelFrame: (callback: unknown) => { const i = callbacks.indexOf(callback as () => void); if (i >= 0) callbacks.splice(i, 1) },
        },
        createSurface: (id: string) => { const s = { id }; surfaces.push(s); return s },
        appendSurface: () => {},
        resizeSurface: () => {},
        getContext: () => context,
        removeSurface: () => {},
    }
    return { platform: plat, surfaces }
}

/**
 * Piattaforma finta per 'static' — stesse cinque chiavi ESATTE che
 * `simpleRenderer.ts` valida (`PLATFORM_KEYS`), nessuna in più: la stessa
 * lezione di `complexPlatform()` sopra, sul lato DOM invece che canvas.
 */
function simplePlatform() {
    return {
        createLayer: (id: string) => ({ id }),
        appendLayer: () => {},
        removeLayer: () => {},
        applyStyle: () => {},
        animate: () => ({ cancel: () => {} }),
    } as unknown as Parameters<typeof createTalosStaticSceneRegistrations>[0]
}

/** Mima `isSceneInstance()` di `stageController.ts`: chiavi proprie, esatte, e nient'altro. */
const INSTANCE_KEYS = ['kind', 'mount', 'renderOrUpdate', 'resize', 'pause', 'resume', 'dispose']
function ownKeysMatchExactly(value: object): boolean {
    const keys = Reflect.ownKeys(value)
    return keys.length === INSTANCE_KEYS.length && keys.every((k) => typeof k === 'string' && INSTANCE_KEYS.includes(k))
}

describe('TALOS V6 "simple" — il motore complex, etichettato simple', () => {
    it('registra le 14 scene come kind:"simple", una per preset', () => {
        const registrations = createTalosSimpleSceneRegistrations(complexPlatform().platform)
        expect(registrations.map((entry) => `${entry.kind}:${entry.id}`))
            .toEqual(TALOS_MOTION_SCENE_IDS.map((id) => `simple:${id}`))
        expect(createSceneRegistry(registrations).snapshot()).toHaveLength(14)
    })

    it('⭐⭐⭐ l\'istanza VERA porta kind:"simple" come proprietà propria, non solo il tipo', () => {
        const [forge] = createTalosSimpleSceneRegistrations(complexPlatform().platform)
        const instance = forge.factory(input())
        expect(instance.kind).toBe('simple')
        expect(ownKeysMatchExactly(instance)).toBe(true)
        for (const method of ['mount', 'renderOrUpdate', 'resize', 'pause', 'resume', 'dispose'] as const) {
            expect(typeof instance[method]).toBe('function')
        }
    })

    it('⛔ IL VERSO CONTRARIO: una factory complex NON adattata resta kind:"complex"', () => {
        // Senza questo confronto, un adattatore che non facesse nulla passerebbe comunque il test sopra.
        const rawFactory = createComplexSceneFactory(TALOS_COMPLEX_SCENE_DEFINITIONS[0], complexPlatform().platform)
        const rawInstance = rawFactory(input())
        expect(rawInstance.kind).toBe('complex')
        expect(rawInstance.kind).not.toBe('simple')
    })

    it('monta davvero sul motore canvas: crea una surface e disegna attraverso la stessa piattaforma', () => {
        const { platform, surfaces } = complexPlatform()
        const [forge] = createTalosSimpleSceneRegistrations(platform)
        const instance = forge.factory(input())
        instance.mount({ kind: 'simple', target: {} })
        instance.renderOrUpdate(input())
        expect(surfaces.length).toBe(1)
    })

    it('createTalosStaticSceneRegistrations resta invariata: 14 scene kind:"static" dal deposito _legacyDom', () => {
        const registrations = createTalosStaticSceneRegistrations(simplePlatform())
        expect(registrations.map((entry) => `${entry.kind}:${entry.id}`))
            .toEqual(TALOS_MOTION_SCENE_IDS.map((id) => `static:${id}`))
    })
})
