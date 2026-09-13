import { describe, expect, it, vi } from 'vitest'
import { talosAttrezziAnthropicAGradi, talosToolsForAnthropic } from '@/lib/tools/registry'
import { talosVaDifferito } from '@/lib/tools/aperturaProgressiva'
import { talosProfiloCompilato } from '@/lib/tools/improntaDelProfilo'
import { createTalosToolset } from '@/lib/tools/toolset'

/**
 * ⭐⭐⭐ QUANTO COSTA DAVVERO IL PREFISSO DI ANTHROPIC, OGGI.
 *
 * ## Perché questo test esiste
 *
 * In `chatController` c'è un commento che dice: *«Finché non sappiamo
 * conservarli, Anthropic passa dal catalogo compatto come gli altri»*. La riga
 * che decide, tre righe sotto, dice l'opposto:
 *
 *     const catalogoAttivo = profile?.provider !== 'anthropic' && …
 *
 * ⇒ Anthropic è ESCLUSO dal catalogo compatto, e il ramo nativo è spento in
 * `anthropicAdapter`. Cioè riceve gli schemi INTERI, e il commento descrive una
 * cura che il codice non applica.
 *
 * ⛔ Un commento che dice una cosa e un codice che ne fa un'altra è il difetto
 * peggiore che ci sia in un file di questa dimensione: chi legge crede alla
 * frase e non va a guardare la riga.
 *
 * ⇒ Questo test non giudica quale sia la scelta giusta — la decide l'owner.
 * Mette il NUMERO davanti alla decisione, così smette di essere un'opinione.
 */
describe('il prefisso che Anthropic riceve oggi', () => {
    it('dice quanto costa, e quanto costerebbe aperto a gradi', async () => {
        // La stessa costruzione che usa il cancello «Anthropic accetta ogni
        // attrezzo»: si misura la suite VERA, non un campione scelto a mano.
        const insieme = await createTalosToolset({
            repository: {} as never,
            readVaultFileText: vi.fn(async () => null),
            readVaultFileBytes: vi.fn(async () => null),
            requestConsent: vi.fn(async () => true),
            sessionTitles: vi.fn(async () => new Map<string, string>()),
            libraryEnabled: () => true,
            web: () => ({}) as never,
            documents: () => ({}) as never,
            images: () => ({}) as never,
            saveVaultFileToDevice: vi.fn(async () => ({}) as never),
            libraryContextPolicy: {} as never,
        } as never)

        /*
         * ⛔ TUTTI gli attrezzi accesi, non i default.
         *
         * È la stessa ragione del cancello «Anthropic accetta ogni attrezzo»:
         * misurare il prefisso coi soli default misura il caso più leggero, e
         * chi accende un interruttore paga un conto che nessuno aveva misurato.
         */
        const { TALOS_AGENT_TOOL_IDS } = await import('@/lib/tools/toolControls')
        const tuttiAccesi = Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true]))
        const attrezzi = insieme.offer(
            { read: 'allow', write: 'allow', outbound: 'allow' },
            tuttiAccesi as never,
        )

        const interi = talosToolsForAnthropic(attrezzi as never)
        const aGradi = talosAttrezziAnthropicAGradi(attrezzi as never, talosVaDifferito)

        const profiloIntero = talosProfiloCompilato('anthropic/interi', interi, attrezzi as never)
        const profiloAGradi = talosProfiloCompilato('anthropic/a-gradi', aGradi, attrezzi as never)

        // ⛔ Il numero si STAMPA, perché è il motivo per cui il test esiste: una
        // asserzione sola direbbe «passa» e nasconderebbe la cosa da guardare.
        console.info(
            `\n  attrezzi offerti             : ${attrezzi.length}`
            + '\n  --- quello che SPEDIAMO ---'
            + `\n  intero                       : ${profiloIntero.byteSchema} byte`
            + `\n  a gradi                      : ${profiloAGradi.byteSchema} byte`
            + '\n  --- quello che il MODELLO VEDE ---'
            + `\n  intero                       : ${profiloIntero.byteInVista} byte · ~${profiloIntero.tokenInVista} token`
            + `\n  a gradi                      : ${profiloAGradi.byteInVista} byte · ~${profiloAGradi.tokenInVista} token`
            + `\n  differiti                    : ${profiloAGradi.differiti.length} su ${attrezzi.length}`
            + `\n  ⇒ risparmio VERO             : ${Math.round((1 - profiloAGradi.byteInVista / profiloIntero.byteInVista) * 100)}%`
            + `\n  poteri nel prefisso          : ${JSON.stringify(profiloIntero.poteri)}\n`,
        )

        /*
         * ⛔ Si custodisce il risparmio DOVE ESISTE.
         *
         * La prima stesura pretendeva che «a gradi» pesasse meno sul filo, ed
         * era rossa: pesa 409 byte di PIU', perche' manda comunque ogni schema
         * e aggiunge `defer_loading` piu' la riga della ricerca. Il risparmio
         * sta in cio' che entra nel contesto del modello.
         *
         * Un test che avesse insistito sul filo avrebbe protetto la cosa
         * sbagliata — e prima o poi qualcuno avrebbe «ottimizzato» via il
         * meccanismo per farlo passare.
         */
        expect(profiloAGradi.byteInVista).toBeLessThan(profiloIntero.byteInVista)
        expect(profiloAGradi.differiti.length).toBeGreaterThan(0)
        // E le due forme devono essere distinguibili: se avessero la stessa
        // impronta staremmo spedendo la stessa cosa con due nomi diversi.
        expect(profiloAGradi.impronta).not.toBe(profiloIntero.impronta)
    })
})
