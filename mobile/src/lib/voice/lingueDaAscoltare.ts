import { talosTagDiLinguaValido } from '@/lib/dictationPolicy'

/**
 * Le lingue fra cui il motore può muoversi quando ascolta in automatico.
 *
 * ⛔ NON è «tutte quelle che il dispositivo sa fare»: dare cinquanta lingue al
 * commutatore lo fa sbagliare — ogni lingua in più è un'altra ipotesi fra cui
 * confondersi su una frase corta. Si tengono quelle che questa persona usa
 * DAVVERO, e si misura da tre fatti che abbiamo già:
 *
 *   1. le lingue del sistema, in ordine di preferenza (quelle scelte a mano);
 *   2. la lingua dell'interfaccia di TALOS;
 *   3. la preferenza dichiarata dal servizio vocale.
 *
 * Poi si intersecano con ciò che il dispositivo dichiara di saper ascoltare:
 * chiedere una lingua che non ha il pacchetto è un modo elegante di non farsi
 * capire.
 */
export function talosLingueDaAscoltare(input: {
    sistema: readonly string[]
    interfaccia?: string
    preferita?: string
    supportate?: readonly string[]
}): string[] {
    const candidate = [
        ...(input.preferita ? [input.preferita] : []),
        ...input.sistema,
        ...(input.interfaccia ? [input.interfaccia] : []),
    ].filter(talosTagDiLinguaValido)

    const supportate = (input.supportate ?? []).filter(talosTagDiLinguaValido)
    const base = supportate.length
        ? candidate.filter((tag) => supportate.some((s) => stessaLingua(s, tag)))
            .map((tag) => supportate.find((s) => stessaLingua(s, tag)) as string)
        : candidate

    const viste = new Set<string>()
    const fuori: string[] = []
    for (const tag of base) {
        const chiave = radice(tag)
        if (viste.has(chiave)) continue
        viste.add(chiave)
        fuori.push(tag)
    }
    // Oltre tre, il commutatore inizia a scambiare una parola straniera per un
    // cambio di lingua: è il limite che tengono anche le tastiere.
    return fuori.slice(0, 3)
}

const radice = (tag: string): string => tag.split('-')[0]!.toLowerCase()
const stessaLingua = (a: string, b: string): boolean => radice(a) === radice(b)
