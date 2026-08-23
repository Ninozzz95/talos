/**
 * ⭐⭐⭐ "SIMPLE" ORA GIRA SUL MOTORE COMPLEX — 2026-08-23.
 *
 * Scelta esplicita dell'owner: le 14 scene che fino a oggi erano il livello
 * "complex" (canvas, disegnate a mano libera) diventano il nuovo livello
 * "simple" — sono rimaste **identiche**, spostate senza modifiche in
 * `../complexAsSimple/`. Il nuovo pacchetto artistico prende il posto di
 * "complex" (vedi `../complex/`).
 *
 * ⛔ Compromesso accettato dall'owner: "simple" smette di essere il ripiego
 * leggero DOM/CSS per i telefoni deboli. Diventa un secondo livello canvas.
 * Il ripiego leggero per i device che non reggono il canvas resta solo
 * "static" (frame fermo, ancora DOM — vedi `createTalosStaticSceneRegistrations`
 * qui sotto, che NON cambia e continua a leggere da `./_legacyDom/`).
 *
 * ⛔ Le vecchie scene DOM/CSS di "simple" NON sono state cancellate: sono in
 * `./_legacyDom/`, spostate senza modifiche. Se un giorno servirà un vero
 * ripiego leggero, sono lì, pronte, e "static" le usa già.
 *
 * ⛔⛔ IL CONTRATTO A RUNTIME, non solo il tipo — cercato: TypeScript verifica
 * i discriminanti (`kind`) solo a compile-time, non a runtime. Ed è esattamente
 * per questo che `stageController.ts` valida `instance.kind` DA SOLO, come
 * proprietà PROPRIA e STRETTA (`isSceneInstance`, via `Reflect.ownKeys`): un
 * cast a `SceneFactory<'simple'>` supererebbe il typecheck ma non la guardia
 * vera, perché l'oggetto che esce da `createComplexSceneFactory` porta
 * `kind: 'complex'` scritto dentro per davvero. `asSimpleFactory` ricostruisce
 * l'istanza con `kind: 'simple'` come proprietà propria, stessi metodi
 * (mount/renderOrUpdate/resize/pause/resume/dispose) passati per riferimento —
 * nessuna riscrittura di comportamento, solo l'etichetta cambia.
 */
import {
    createComplexSceneFactory, type ComplexRendererOptions, type ComplexRendererPlatform,
} from '../../renderers/complexRenderer'
import { createStaticSceneFactory } from '../../renderers/staticRenderer'
import type { SimpleRendererPlatform } from '../../renderers/simpleRenderer'
import type { SceneFactory, SceneInstance, SimpleSceneRegistration, StaticSceneRegistration } from '../../sceneRegistry'
import { TALOS_COMPLEX_SCENE_DEFINITIONS } from '../complexAsSimple'
import { TALOS_SIMPLE_SCENE_DEFINITIONS } from './_legacyDom'

/**
 * Avvolge una factory 'complex' e ne rifà l'istanza con `kind: 'simple'`
 * come proprietà PROPRIA — non un cast. Stessi `mount`/`renderOrUpdate`/
 * `resize`/`pause`/`resume`/`dispose`, passati per riferimento: il
 * comportamento resta byte-per-byte quello del motore complex.
 */
function asSimpleFactory(factory: SceneFactory<'complex'>): SceneFactory<'simple'> {
    return (input) => {
        const instance = factory(input)
        /*
         * ⛔ `mount` qui sotto è tipato per `SceneMountContext<'complex'>`, non
         * `<'simple'>` — TypeScript ha ragione a rifiutare l'assegnazione
         * diretta. Verificato leggendo `createComplexSceneFactory` in
         * `renderers/complexRenderer.ts`: il suo `mount` legge SOLO
         * `mountContext.target`, mai `.kind`. Il cast è dichiarato, non
         * nascosto — passa da `unknown` come suggerisce lo stesso errore TS.
         */
        return Object.freeze({
            kind: 'simple' as const,
            mount: instance.mount,
            renderOrUpdate: instance.renderOrUpdate,
            resize: instance.resize,
            pause: instance.pause,
            resume: instance.resume,
            dispose: instance.dispose,
        }) as unknown as SceneInstance<'simple'>
    }
}

export function createTalosSimpleSceneRegistrations(
    platform: ComplexRendererPlatform,
    options: ComplexRendererOptions = {},
): readonly SimpleSceneRegistration[] {
    return Object.freeze(TALOS_COMPLEX_SCENE_DEFINITIONS.map((definition) => Object.freeze({
        id: definition.id as SimpleSceneRegistration['id'],
        kind: 'simple' as const,
        factory: asSimpleFactory(createComplexSceneFactory(definition, platform, options)),
        assets: Object.freeze([]),
    })))
}

/**
 * ⛔ INVARIATA. "static" resta il vero ripiego leggero (DOM, frame fermo) e
 * continua a leggere le definizioni DOM di sempre — solo il percorso cambia,
 * spostato in `./_legacyDom/`.
 */
export function createTalosStaticSceneRegistrations(
    platform: SimpleRendererPlatform,
): readonly StaticSceneRegistration[] {
    return Object.freeze(TALOS_SIMPLE_SCENE_DEFINITIONS.map((definition) => Object.freeze({
        id: definition.id,
        kind: 'static' as const,
        factory: createStaticSceneFactory(definition, platform),
        assets: Object.freeze([]),
    }) as StaticSceneRegistration))
}
