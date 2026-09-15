import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * D-53 — UN PROFILO CON UNA MISURA SOLA NON BASTA PIU', e va completato.
 *
 * Il selettore decide con tre termini (apertura + lettura + scrittura). I
 * profili scritti prima dell'11/09/2026 portano solo `ttftMs`: con quelli la
 * scelta sarebbe la stessa di prima, cioe' quella che sbagliava su sette
 * modelli su otto. Ma un profilo vecchio vale ancora come prova di
 * CORRETTEZZA: non si cancella, si rimisura.
 *
 * ⛔ Queste prove leggono il Java perche' la regola vive in un metodo privato
 * del plugin, dove Vitest non esegue: se qualcuno tornasse a «basta che il
 * profilo esista», il sondaggio non ripartirebbe mai sui telefoni che hanno
 * gia' i profili vecchi — esattamente il caso dell'owner.
 */
const plugin = readFileSync(resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosLlamaPlugin.java'), 'utf8')
const profilo = readFileSync(resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosLocalProfile.java'), 'utf8')
const store = readFileSync(resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosLocalProfileStore.java'), 'utf8')

describe('D-53 — il profilo senza velocita di lettura si rimisura', () => {
    it('PSL-01 un profilo conta come presente SOLO se ha la velocita di lettura', () => {
        const corpo = plugin.slice(plugin.indexOf('private static boolean profiloAssentePerQuestoModello'))
        expect(corpo).toContain('if (profilo.prefillTokPerSec > 0) return false;')
    })

    /** ⛔ AL CONTRARIO: -1 vuol dire «non misurato», e non e mai zero. */
    it('PSL-02 il costruttore vecchio a otto argomenti delega con -1, non con 0', () => {
        expect(profilo).toContain('qualificationLevel, decodeTokPerSec, -1, -1);')
    })

    it('PSL-03 lo store legge i due campi con un ripiego a -1, mai getDouble che lancia', () => {
        expect(store).toContain('riga.optDouble("prefillTokPerSec", -1)')
        expect(store).toContain('riga.optLong("openMs", -1)')
        expect(store).toContain('o.put("prefillTokPerSec", riga.prefillTokPerSec);')
        expect(store).toContain('o.put("openMs", riga.openMs);')
    })

    it('PSL-04 il ponte non promuove un -1 a numero: assente o non positivo vale null', () => {
        const ts = readFileSync(resolve(process.cwd(), 'src/services/localEngine.ts'), 'utf8')
        expect(ts).toContain("typeof p.prefillTokPerSec === 'number' && p.prefillTokPerSec > 0")
        expect(ts).toContain("typeof p.openMs === 'number' && p.openMs >= 0")
    })
})
