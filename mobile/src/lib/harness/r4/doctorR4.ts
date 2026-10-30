/**
 * ⛔ K3-C2b (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il Doctor del Codice su r4, COPIA FISSATA delle regole del desktop.
 *
 * Fonte: r4 @ `4cee78f33` `harness-ui/frontend/src/components/doctor.js` (sha256 `154b39a2…a59686`; da `701c6c0d2` cambia solo la riga
 * delle cartelle, `sceltaPerSessione`): `valida` (:11-19), `dettaglioSessioni` (:20-27), `controlliDoctor` (:28-43), `contaGravitaDoctor` (:44). Testi: `i18n/testi/varie.js` (chiavi
 * `doctor.*`, `testi/varie-doctor-r4.json`) e `server.js` (`testiServerR4.ts`). La conformità la prova il golden calcolato dal VERO
 * `doctor.js` (`tests/fixtures/r4/doctor-4cee78f33.json`).
 *
 * Unica differenza dichiarata (accordo con Nino1, 15/10/2026): sul telefono `shell: 'desktop'` vuol dire «sul dispositivo», e la
 * riga è `doctor.check.shell.device`; la gravità (`info`) resta quella del desktop.
 */
import dizionario from './testi/varie-doctor-r4.json'
import { esecuzioneDelFornitoreR4, nomeDelFornitoreR4, regoleTestiR4, testoDelCampoR4 } from './testiServerR4'

export type GravitaDoctorR4 = 'danger' | 'warning' | 'info' | 'success'

export interface VoceDoctorR4 {
    id: string
    titolo: string
    gravita: GravitaDoctorR4
    righe: string[]
}

export const TESTI_DOCTOR_R4: { origine: { commit: string; percorso: string; sha256: string; prefisso: string }; it: Record<string, string>; en: Record<string, string> } = dizionario

const ORDINE: Record<GravitaDoctorR4, number> = { danger: 0, warning: 1, info: 2, success: 3 }
const { italiano, interpola, propria, regolePlurale } = regoleTestiR4

/** `t('varie.doctor.…')` di r4: la voce nella lingua, altrimenti quella inglese. */
export function testoDoctorR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const nome = chiave.replace(/^varie\./u, '')
    const tabella = italiano(lingua) ? TESTI_DOCTOR_R4.it : TESTI_DOCTOR_R4.en
    return interpola(propria(tabella, nome) ?? propria(TESTI_DOCTOR_R4.en, nome) ?? chiave, valori)
}

/** `tn` di r4: singolare o plurale secondo la lingua, con `{n}` già sostituito. */
function plurale(uno: string, molti: string, n: number, lingua: string, valori?: Record<string, unknown>): string {
    return testoDoctorR4(regolePlurale(lingua).select(Number(n)) === 'one' ? uno : molti, lingua, { n, ...(valori ?? {}) })
}

/** Le parole della gravità (Guasto, Avviso, Nota, OK). */
export function gravitaDoctorR4(gravita: GravitaDoctorR4, lingua: string): string {
    return testoDoctorR4(`varie.doctor.severity.${gravita === 'success' ? 'ok' : gravita}`, lingua)
}

export class ErroreDoctorR4 extends Error {}

const oggetto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const testo = (v: unknown): string => (typeof v === 'string' ? v : '')

function valida(r: unknown, lingua: string): asserts r is Record<string, any> {
    const errore = (): never => { throw new ErroreDoctorR4(testoDoctorR4('varie.doctor.error.invalidResponse', lingua)) }
    if (!oggetto(r) || !['chiaveApi', 'git', 'naviga'].every((k) => typeof r[k] === 'boolean') || !['desktop', 'wsl2', 'none'].includes(r.shell as string)) errore()
    const tipi: Record<string, Record<string, string>> = {
        labs: { accesi: 'array' }, ricercaWeb: { fonte: 'string', pronta: 'boolean' }, cartelleProgetto: { disponibili: 'boolean', conteggio: 'number' },
        providers: { storeAvailable: 'boolean', items: 'array' }, ownerRuntime: { configurato: 'boolean', pronto: 'boolean' },
        catalogoTask: { disponibile: 'boolean' }, sessioniPersistenza: { corrotte: 'array' },
    }
    const ok = r as Record<string, any>
    for (const [k, forma] of Object.entries(tipi)) {
        if (!(k in ok)) continue
        if (!oggetto(ok[k])) errore()
        for (const [f, t] of Object.entries(forma)) {
            const v = ok[k][f]
            if (t === 'array' ? !Array.isArray(v) : typeof v !== t || (t === 'number' && (!Number.isFinite(v) || v < 0))) errore()
        }
        if ('dettaglio' in ok[k] && typeof ok[k].dettaglio !== 'string') errore()
    }
    if (ok.labs && !ok.labs.accesi.every((v: unknown) => typeof v === 'string')) errore()
    if (ok.providers && !ok.providers.items.every((p: unknown) => oggetto(p) && typeof p.id === 'string' && typeof p.label === 'string' && typeof p.keyConfigured === 'boolean')) errore()
    const s = ok.sessioniPersistenza
    if (s) {
        if (!s.corrotte.every((v: unknown) => typeof v === 'string')) errore()
        if ('scartate' in s && (!Array.isArray(s.scartate) || !s.scartate.every((v: unknown) => oggetto(v) && typeof v.sessionId === 'string' && typeof v.motivo === 'string' && (!('dettaglio' in v) || typeof v.dettaglio === 'string')))) errore()
        if ('ultimaLettura' in s && (!oggetto(s.ultimaLettura) || !['ripristinate', 'totali'].every((k) => Number.isInteger(s.ultimaLettura[k]) && s.ultimaLettura[k] >= 0))) errore()
    }
}

function dettaglioSessioni(s: Record<string, any>, scarti: Record<string, any>[], lingua: string): string | undefined {
    if (!s.dettaglioParams || !s.perMotivo) return testoDelCampoR4(s, 'dettaglio', lingua)
    const reasons = Object.entries(s.perMotivo).map(([motivo, n]) => {
        const voce = scarti.find((v) => v.motivo === motivo)
        return `${n} ${voce ? testoDelCampoR4(voce, 'motivo', lingua) : motivo}`
    }).join(', ')
    return testoDelCampoR4({ ...s, dettaglioParams: { ...s.dettaglioParams, reasons } }, 'dettaglio', lingua)
}

/** I controlli del Doctor, ordinati per gravità: la stessa uscita di `controlliDoctor` di r4 (tranne la riga della shell, sopra). */
export function controlliDoctorR4(risposta: unknown, lingua: string): VoceDoctorR4[] {
    valida(risposta, lingua)
    const r = risposta
    const t = (chiave: string, valori?: Record<string, unknown>) => testoDoctorR4(`varie.${chiave}`, lingua, valori)
    const campo = (o: unknown, nome: string) => testoDelCampoR4(o, nome, lingua)
    const c: VoceDoctorR4[] = []
    const add = (id: string, titolo: string, gravita: GravitaDoctorR4, ...righe: unknown[]) =>
        c.push({ id, titolo, gravita, righe: (righe.flat() as unknown[]).filter(Boolean) as string[] })
    const ignoto = (id: string, titolo: string) => add(id, titolo, 'info', t('doctor.notObserved'))

    add('chiave', t('doctor.check.apiKey.title'), r.chiaveApi ? 'info' : 'warning', r.chiaveApi ? t('doctor.check.apiKey.configured') : t('doctor.check.apiKey.missing'))
    // ⛔ sul telefono «desktop» è il dispositivo stesso: la frase del dispositivo, non quella dell'ambiente desktop
    add('shell', t('doctor.check.shell.title'), r.shell === 'none' ? 'danger' : r.shell === 'wsl2' ? 'success' : 'info',
        r.shell === 'none' ? t('doctor.check.shell.none') : r.shell === 'wsl2' ? t('doctor.check.shell.wsl2') : t('doctor.check.shell.device'))
    add('git', 'Git', r.git ? 'success' : 'warning', r.git ? t('doctor.check.git.ok') : t('doctor.check.git.bad'))
    add('browser', t('doctor.check.browser.title'), r.naviga ? 'info' : 'warning', r.naviga ? t('doctor.check.browser.ok') : t('doctor.check.browser.bad'))
    if (r.ownerRuntime) add('runtime', t('doctor.check.runtime.title'), r.ownerRuntime.pronto ? 'success' : 'warning',
        r.ownerRuntime.configurato ? t('doctor.check.runtime.configured') : t('doctor.check.runtime.notConfigured'),
        campo(r.ownerRuntime, 'dettaglio') || (r.ownerRuntime.pronto ? t('doctor.check.runtime.ready') : t('doctor.check.runtime.notReady')))
    else ignoto('runtime', t('doctor.check.runtime.title'))
    if (r.catalogoTask) add('catalogo', t('doctor.check.catalog.title'), r.catalogoTask.disponibile ? 'success' : 'warning',
        campo(r.catalogoTask, 'dettaglio') || (r.catalogoTask.disponibile ? t('doctor.check.catalog.available') : t('doctor.check.catalog.unavailable')))
    else ignoto('catalogo', t('doctor.check.catalog.title'))
    // pin 4cee78f33 (a25dca408, 29/10): zero cartelle fisse con `sceltaPerSessione` è lo stato voluto, non un avviso
    if (r.cartelleProgetto) {
        const perSessione = r.cartelleProgetto.sceltaPerSessione === true && r.cartelleProgetto.conteggio === 0
        add('cartelle', t('doctor.check.folders.title'), r.cartelleProgetto.disponibili || perSessione ? 'success' : 'warning',
            perSessione ? t('doctor.check.folders.choosePerSession')
                : plurale('varie.doctor.check.folders.allowedOne', 'varie.doctor.check.folders.allowedMany', r.cartelleProgetto.conteggio, lingua),
            campo(r.cartelleProgetto, 'dettaglio'))
    } else ignoto('cartelle', t('doctor.check.folders.title'))
    if (r.ricercaWeb) add('ricerca', t('doctor.check.search.title'), r.ricercaWeb.pronta || r.ricercaWeb.fonte === 'off' ? 'info' : 'warning',
        campo(r.ricercaWeb, 'etichetta') || r.ricercaWeb.fonte, campo(r.ricercaWeb, 'dettaglio'), t('doctor.check.search.note'))
    else ignoto('ricerca', t('doctor.check.search.title'))
    if (r.providers) add('fornitori', t('doctor.check.providers.title'), r.providers.storeAvailable ? 'info' : 'warning',
        r.providers.storeAvailable ? t('doctor.check.providers.keychainAvailable') : t('doctor.check.providers.keychainUnavailable'),
        r.providers.items.map((p: Record<string, any>) => nomeDelFornitoreR4(p, lingua) + ': '
            + (p.keyConfigured ? t('doctor.check.providers.keyConfigured') : p.requiresKey === false ? t('doctor.check.providers.keyOptional') : t('doctor.check.providers.keyMissing'))
            + (testo(p.execution) ? ' · ' + esecuzioneDelFornitoreR4(p.execution, lingua) : '')),
        t('doctor.check.providers.note'))
    else ignoto('fornitori', t('doctor.check.providers.title'))
    if (r.labs) add('labs', t('doctor.check.labs.title'), 'info',
        campo(r.labs, 'dettaglio') || t('doctor.check.labs.on', { list: r.labs.accesi.join(', ') || t('doctor.check.labs.none') }))
    else ignoto('labs', t('doctor.check.labs.title'))
    if (r.sessioniPersistenza) {
        const s = r.sessioniPersistenza
        const scarti: Record<string, any>[] = s.scartate || []
        const nonElencate = s.corrotte.filter((id: string) => !scarti.some((v) => v.sessionId === id))
        add('sessioni', t('doctor.check.sessions.title'),
            s.corrotte.length || scarti.some((v) => ['corrotta', 'lettura-fallita'].includes(v.motivo)) ? 'danger' : scarti.length ? 'warning' : 'success',
            dettaglioSessioni(s, scarti, lingua) || (s.ultimaLettura
                ? t('doctor.check.sessions.restored', { restored: s.ultimaLettura.ripristinate, total: s.ultimaLettura.totali })
                : t('doctor.check.sessions.notObserved')),
            scarti.map((v) => v.sessionId + ' · ' + campo(v, 'motivo') + (v.dettaglio ? ' · ' + campo(v, 'dettaglio') : '')),
            nonElencate.map((id: string) => t('doctor.check.sessions.corrupt', { id })))
    } else ignoto('sessioni', t('doctor.check.sessions.title'))
    return c.sort((a, b) => ORDINE[a.gravita] - ORDINE[b.gravita])
}

export function contaGravitaDoctorR4(voci: VoceDoctorR4[]): Record<GravitaDoctorR4, number> {
    const n: Record<GravitaDoctorR4, number> = { success: 0, info: 0, warning: 0, danger: 0 }
    for (const v of voci) n[v.gravita]++
    return n
}

/** L'esito in una riga (`doctor.summary.result`): quanti controlli e quanti da rivedere. */
export function esitoDoctorR4(voci: VoceDoctorR4[], lingua: string): string {
    const n = contaGravitaDoctorR4(voci)
    return testoDoctorR4('varie.doctor.summary.result', lingua, {
        count: plurale('varie.doctor.checks.one', 'varie.doctor.checks.many', voci.length, lingua),
        review: n.warning + n.danger,
    })
}
