import {
    createComplexSceneFactory, type ComplexRendererOptions, type ComplexRendererPlatform, type ComplexSceneDefinition,
} from '../../renderers/complexRenderer'
import type { ComplexSceneRegistration } from '../../sceneRegistry'
import { forgeComplexScene } from './forge'
import { paperComplexScene } from './paper'
import { terminalComplexScene } from './terminal'
import { auroraComplexScene } from './aurora'
import { glacierComplexScene } from './glacier'
import { emberComplexScene } from './ember'
import { atlasComplexScene } from './atlas'
import { noirComplexScene } from './noir'
import { signalComplexScene } from './signal'
import { violetComplexScene } from './violet'
import { claudiusComplexScene } from './claudius'
import { basicusComplexScene } from './basicus'
import { telemetryComplexScene } from './telemetry'
import { calmComplexScene } from './calm'

export const TALOS_COMPLEX_SCENE_DEFINITIONS = Object.freeze([
    forgeComplexScene, paperComplexScene, terminalComplexScene, auroraComplexScene,
    glacierComplexScene, emberComplexScene, atlasComplexScene, noirComplexScene,
    signalComplexScene, violetComplexScene, claudiusComplexScene, basicusComplexScene,
    telemetryComplexScene, calmComplexScene,
] as const)

/*
 * ⛔⛔ NON BASTA ANNOTARE IL TIPO — provato, e il typecheck vero l'ha bocciato
 * lo stesso: `prepare`/`createState` usano `State` sia in entrata che in
 * uscita, quindi sono CONTROVARIANTI nel parametro. Un `ForgeState` specifico
 * non è assegnabile a un `unknown` generico nella posizione di parametro,
 * nemmeno con l'annotazione esplicita — TypeScript lo rifiuta a ragione: non
 * è un tipo più largo, è un tipo diverso in una posizione dove la varianza
 * conta. Serve il cast dichiarato che passa da `unknown`, come sopra per
 * `asSimpleFactory` in scenes/simple/index.ts — stessa famiglia di difetto,
 * stessa cura. A runtime non cambia niente: ogni chiusura resta coerente con
 * se stessa, il tipo qui serve solo a `createComplexSceneFactory` per
 * accettare l'array, non a garantire alcunché sul contenuto.
 *
 * ⛔⛔ IL README DEL PACCHETTO SBAGLIA — trovato dal typecheck vero, non
 * dalla sua parola: dichiarava "index.ts non deve cambiare". V3 dà a ogni
 * tema il proprio `State`/`Geometry` (`ForgeState`, `PaperState`, ...), a
 * differenza di V2 dove tutti condividevano lo stesso tipo; l'errore vero
 * era "PaperState is missing properties from ForgeState" — TS confondeva un
 * tema con un altro dentro `.map()` su una tupla eterogenea.
 */
const OPAQUE_COMPLEX_SCENE_DEFINITIONS = TALOS_COMPLEX_SCENE_DEFINITIONS as unknown as
    readonly ComplexSceneDefinition<unknown, unknown>[]

export function createTalosComplexSceneRegistrations(
    platform: ComplexRendererPlatform,
    options: ComplexRendererOptions = {},
): readonly ComplexSceneRegistration[] {
    return Object.freeze(OPAQUE_COMPLEX_SCENE_DEFINITIONS.map((definition) => Object.freeze({
        id: definition.id as ComplexSceneRegistration['id'],
        kind: 'complex' as const,
        factory: createComplexSceneFactory(definition, platform, options),
        assets: Object.freeze([]),
    })))
}
