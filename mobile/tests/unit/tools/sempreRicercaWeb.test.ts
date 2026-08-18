import { describe, expect, it } from 'vitest'
import { talosForbidsPersistentGrant } from '@/lib/tools/security'

/**
 * ⛔⛔⛔ «CONSENTI SEMPRE» DEVE ESSERCI ANCHE PER LA RICERCA WEB.
 *
 * Regola dell'owner, 18 agosto: «anche la ricerca web deve avere consenti
 * sempre». È l'estensione di quella del 10 agosto — «voglio che consenti sempre
 * appaia SEMPRE per le ricerche web, nessuno escluso in lettura» — a un caso che
 * quella, letta alla lettera, non copriva.
 *
 * ## Perché non lo copriva: la scrittura è VERA
 *
 * `web_search` non si limita a cercare: archivia i link trovati nella Libreria
 * (`rememberSearch`). Quindi dichiara `requiredActions: ['outbound', 'write']`,
 * e la dichiarazione è onesta.
 *
 * E la regola generale nega il «sempre» quando il rischio è R4 **e** c'è una
 * scrittura. Su una ricerca la catena ci arriva quasi sempre — contenuto non
 * fidato più rete più dati privati è la trifecta — quindi il pulsante spariva
 * proprio sulla funzione che si usa dieci volte al giorno.
 *
 * ⇒ Non è la regola a essere sbagliata: è che qui serve un'ECCEZIONE, e il
 * codice ne aveva già previsto il meccanismo — `sempreConsentibile`, scritto e
 * mai usato da nessuno.
 *
 * ## ⛔ E il compromesso si dice, non si nasconde
 *
 * Un «sempre» su questa ricerca autorizza per sempre anche l'archiviazione dei
 * link. È una scrittura piccola e reversibile — voci di Libreria che si
 * cancellano — ma è una scrittura, e chi legge questo file deve saperlo senza
 * doverlo dedurre.
 *
 * ⭐ L'eccezione è un DATO PER TOOL, non una regola sul rischio: il prossimo R4
 * che nasce non la eredita per sbaglio. Chi la vuole la scrive, e questo test la
 * conta.
 */

describe('la ricerca web tiene il «consenti sempre»', () => {
    const AZIONI_RICERCA = ['outbound', 'write'] as const

    it('⛔ senza l\'eccezione, la catena a R4 lo toglieva', () => {
        expect(talosForbidsPersistentGrant('R4', AZIONI_RICERCA, false)).toBe(true)
        // ⇒ È il caso vero: la regola generale funziona, e proprio per questo
        // toglieva il pulsante alla ricerca.
    })

    it('⭐ con l\'eccezione dichiarata, resta anche a R4', () => {
        expect(talosForbidsPersistentGrant('R4', AZIONI_RICERCA, true)).toBe(false)
    })

    it('⛔ e l\'eccezione NON si eredita: un altro tool che scrive lo perde ancora', () => {
        expect(talosForbidsPersistentGrant('R4', ['write'], false)).toBe(true)
        expect(talosForbidsPersistentGrant('R4', ['outbound', 'write'], false)).toBe(true)
        /*
         * ⛔ È la parte che rende sicura l'eccezione: vale per chi la dichiara,
         * non per la sua classe di rischio. Il prossimo R4 che nasce non se la
         * ritrova addosso perché somiglia a questo.
         */
    })

    it('⭐ e chi non scrive continua a tenerlo senza bisogno di eccezioni', () => {
        expect(talosForbidsPersistentGrant('R4', ['outbound'], false)).toBe(false)
        expect(talosForbidsPersistentGrant('R4', ['read'], false)).toBe(false)
    })
})

describe('⛔ e la dichiarazione è nel catalogo, non in una regola', () => {
    it('web_search la porta', async () => {
        const { TALOS_TOOL_SECURITY } = await import('@/lib/tools/securityCatalog')
        const catalogo = TALOS_TOOL_SECURITY as Record<string, { sempreConsentibile?: boolean }>
        expect(catalogo.web_search?.sempreConsentibile).toBe(true)
        /*
         * ⛔ Il REGISTRO completo delle eccezioni sta in
         * `toolSecurityDeclared.test.ts`, dove c'era già. Non lo si duplica qui:
         * due registri che possono divergere sono peggio di uno, e il primo che
         * diverge diventa quello di cui nessuno si fida.
         */
    })
})
