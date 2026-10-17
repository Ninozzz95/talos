/**
 * ⛔ K3 automazioni e fornitori (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`; owner 17/10 «Automazioni +
 * fornitori + Coordinazione», «Approva · Annulla ora, Modifica dopo»): le carte con cui r4 chiede il sì quando il MODELLO crea, cambia,
 * riprende o fa partire un'automazione, o esclude e riammette un fornitore a valle. Trascrizione del desktop r4 @ 701c6c0d2:
 *   · `components/automazione-carta.js` → `testiCartaAutomazioneR4`, `valoreInParoleR4`, `avvisoInParoleR4`, `bloccoCartaAutomazioneR4`;
 *   · `components/automazioni-v2.js:22-41,98-100` → `parolePianificazioneR4`, `dataBreveR4`, `minacciaInParoleR4`;
 *   · `components/fornitori-carta.js` → `testiCartaFornitoriR4`, `bloccoCartaFornitoriR4`.
 * Il blocco esce come dati (`RigaBloccoR4[]`), il disegno è di `TalosCodiceR4CartaAutomazione.vue`. Le parole sono del desktop.
 */
import sezioniAutomazioni from './testi/sezioni-automazioni-r4.json'
import appCoordinazione from './testi/app-coordinazione-r4.json'
import varieFornitori from './testi/varie-fornitori-r4.json'
import { etichettaPermessoR4 } from './approvazioniR4'
import { nomeModelloUmanoR4 } from './modelloR4'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { sezioni: sezioniAutomazioni, app: appCoordinazione, varie: varieFornitori }
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t()` del desktop sulle parole delle due carte: la lingua, poi l'inglese, poi la chiave; i `{segnaposto}` noti si sostituiscono. */
export function testoAutomazioniR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const t = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    const frase = t ? propria(italiano(lingua) ? t.it : t.en, nome) ?? propria(t.en, nome) : undefined
    if (frase === undefined) return chiave
    return valori ? frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto)) : frase
}
export const testoPluraleAutomazioniR4 = (uno: string, molti: string, n: number, lingua: string) =>
    testoAutomazioniR4(new Intl.PluralRules(italiano(lingua) ? 'it' : 'en').select(Number(n)) === 'one' ? uno : molti, lingua, { n })

export const ATTREZZI_CON_CARTA_R4: readonly string[] = Object.freeze(['automation_create', 'automation_update', 'automation_resume', 'automation_run'])
export const ATTREZZI_FORNITORI_CON_CARTA_R4: readonly string[] = Object.freeze(['provider_exclude', 'provider_allow', 'chatgpt_account'])
const tipo = (azione: unknown): string | undefined => (azione && typeof azione === 'object' ? (azione as { tipo?: unknown }).tipo as string | undefined : undefined)
export const eCartaAutomazioneR4 = (azione: unknown) => ATTREZZI_CON_CARTA_R4.includes(tipo(azione) as string)
export const eCartaFornitoriR4 = (azione: unknown) => ATTREZZI_FORNITORI_CON_CARTA_R4.includes(tipo(azione) as string)
/** «Modifica» ha senso solo dove la carta porta una bozza da correggere (sul telefono ancora senza pulsante: decisione dell'owner). */
export const cartaModificabileR4 = (azione: unknown) => tipo(azione) === 'automation_create' || tipo(azione) === 'automation_update'
/** La riga del telefono (decisione dell'owner dopo la misura sul Pad): dove si pianifica un giro, non per «esegui ora». */
export const notaDelTelefonoR4 = (azione: unknown) => ['automation_create', 'automation_update', 'automation_resume'].includes(tipo(azione) as string)

const segmento = (codice: unknown) => String(codice ?? '').replace(/-([a-z])/gu, (_, c: string) => c.toUpperCase())

/** Una data in parole brevi, nell'ora del dispositivo (lo stesso fuso in cui la persona ha scritto l'orario). */
export function dataBreveR4(valore: unknown, lingua: string): string {
    const d = typeof valore === 'string' ? new Date(valore) : null
    if (!d || !Number.isFinite(d.getTime())) return testoAutomazioniR4('sezioni.common.dateNotRecorded', lingua)
    return d.toLocaleString(italiano(lingua) ? 'it-IT' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** «Ogni giorno alle 09:00», «Giorni feriali alle 18:30»… nella lingua dell'app; mai l'oggetto grezzo. */
export function parolePianificazioneR4(p: unknown, lingua: string): string {
    const t = (k: string, v?: Record<string, unknown>) => testoAutomazioniR4(k, lingua, v)
    const x = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    switch (x.tipo) {
        case 'manuale': return t('sezioni.automations.v2.when.manual')
        case 'ogni-ora': return t('sezioni.automations.v2.when.hourly', { minute: String(x.minuto).padStart(2, '0') })
        case 'giornaliera': return t('sezioni.automations.v2.when.daily', { time: x.ora })
        case 'feriali': return t('sezioni.automations.v2.when.weekdays', { time: x.ora })
        case 'settimanale': return t('sezioni.automations.v2.when.weekly', { day: t(`sezioni.automations.v2.day.${x.giorno}`), time: x.ora })
        case 'ogni-n-minuti': return testoPluraleAutomazioniR4('sezioni.automations.v2.when.everyMinutesOne', 'sezioni.automations.v2.when.everyMinutesMany', x.minuti as number, lingua)
        case 'cron': return t('sezioni.automations.v2.when.cron', { expr: x.espressione })
        case 'una-volta': return t('sezioni.automations.v2.when.once', { date: dataBreveR4(`${x.quando}:00`, lingua) })
        default: return t('sezioni.automations.interval.unknown')
    }
}

export const minacciaInParoleR4 = (codice: unknown, lingua: string) => testoAutomazioniR4(`sezioni.automations.v2.card.threat.${segmento(codice)}`, lingua)

const ETICHETTE: Readonly<Record<string, string>> = Object.freeze({
    nome: 'sezioni.automations.v2.sheet.name',
    istruzioni: 'sezioni.automations.v2.row.instructions',
    pianificazione: 'sezioni.automations.v2.sheet.when',
    cartella: 'sezioni.automations.v2.row.folder',
    modello: 'sezioni.automations.row.model',
    permessi: 'sezioni.automations.v2.row.permissions',
    coordinazione: 'app.automations.coordination',
    ripeti: 'sezioni.automations.v2.row.repeat',
    prossimaEsecuzione: 'sezioni.automations.v2.card.firstRun',
})

/** Un campo della bozza in parole. */
export function valoreInParoleR4(campo: string, valore: unknown, lingua: string): string {
    const t = (k: string, v?: Record<string, unknown>) => testoAutomazioniR4(k, lingua, v)
    if (campo === 'pianificazione') return parolePianificazioneR4(valore, lingua)
    if (campo === 'modello') return typeof valore === 'string' && valore.trim() ? (nomeModelloUmanoR4(valore, lingua) || valore) : t('sezioni.automations.modelServerDefault')
    if (campo === 'permessi') return etichettaPermessoR4(valore, lingua)
    if (campo === 'coordinazione') return t(valore === true ? 'sezioni.automations.v2.card.on' : 'sezioni.automations.v2.card.off')
    if (campo === 'ripeti') {
        return valore === null || valore === undefined ? t('sezioni.automations.v2.row.repeatForever')
            : valore === 1 ? t('sezioni.automations.v2.sheet.repeatOnce') : testoPluraleAutomazioniR4('sezioni.automations.v2.sheet.repeatTimesOne', 'sezioni.automations.v2.sheet.repeatTimesMany', valore as number, lingua)
    }
    if (campo === 'prossimaEsecuzione') return valore ? dataBreveR4(valore, lingua) : t('sezioni.automations.v2.row.nextNone')
    return typeof valore === 'string' ? valore : String(valore ?? '')
}

export interface TestiCartaR4 { badge: string; bersaglio: string; perche: string; motivo: string; nota?: string }

/** Badge, bersaglio (il nome) e la frase del perché. */
export function testiCartaAutomazioneR4(azione: unknown, lingua: string): TestiCartaR4 {
    const a = (azione ?? {}) as { tipo?: string; bozza?: { nome?: string }; automazione?: { nome?: string } }
    const nome = a.bozza?.nome ?? a.automazione?.nome ?? ''
    const frase = ({
        automation_create: 'sezioni.automations.v2.card.create',
        automation_update: 'sezioni.automations.v2.card.update',
        automation_resume: 'sezioni.automations.v2.card.resume',
        automation_run: 'sezioni.automations.v2.card.run',
    } as Record<string, string>)[a.tipo ?? '']
    return {
        badge: testoAutomazioniR4('sezioni.automations.v2.card.badge', lingua),
        bersaglio: nome,
        perche: frase ? testoAutomazioniR4(frase, lingua, { name: nome }) : '',
        motivo: testoAutomazioniR4('sezioni.automations.v2.card.why', lingua),
    }
}

/* Il nome della cartella, non il percorso: il percorso intero è già nella riga «Cartella» della bozza */
const nomeCartella = (percorso: unknown) => String(percorso ?? '').replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() || String(percorso ?? '')

interface AvvisoR4 { codice?: string; chat?: unknown; bozza?: unknown }

/** Una riga «oltre la chat» in parole. */
export function avvisoInParoleR4(avviso: unknown, lingua: string): string {
    const a = (avviso ?? {}) as AvvisoR4
    const chiave = `sezioni.automations.v2.card.beyond.${segmento(a.codice)}`
    if (a.codice === 'permessi-piu-ampi') return testoAutomazioniR4(chiave, lingua, { before: etichettaPermessoR4(a.chat, lingua), after: etichettaPermessoR4(a.bozza, lingua) })
    if (a.codice === 'altra-cartella' || a.codice === 'cartella-mai-aperta' || a.codice === 'altra-cartella-mai-aperta') {
        return testoAutomazioniR4(chiave, lingua, { folder: nomeCartella(a.bozza) })
    }
    return testoAutomazioniR4(chiave, lingua)
}

/* Un'altra cartella che è anche mai aperta è UNA notizia sola sulla stessa cartella: una riga, non due */
function unisciCartella(oltre: AvvisoR4[]): AvvisoR4[] {
    const altra = oltre.find((a) => a.codice === 'altra-cartella')
    const mai = oltre.find((a) => a.codice === 'cartella-mai-aperta')
    if (!altra || !mai) return oltre
    return oltre.filter((a) => a !== mai).map((a) => (a === altra ? { ...altra, codice: 'altra-cartella-mai-aperta' } : a))
}

export type RigaBloccoR4 =
    | { tipo: 'avvisi'; di: 'minacce' | 'oltre'; ruolo: 'alert' | null; titolo: string; righe: { testo: string; avviso: string | null }[] }
    | { tipo: 'riga'; k: string; v: string }
    | { tipo: 'testo'; k: string; testo: string }

/** Gli avvisi in testa al blocco: prima le minacce (riquadro d'allarme), poi ciò che va oltre la chat. Niente avvisi ⇒ niente riquadri. */
function avvisi(azione: { avvisi?: { oltre?: unknown; minacce?: unknown } }, lingua: string): RigaBloccoR4[] {
    const fuori: RigaBloccoR4[] = []
    const oltre = unisciCartella(Array.isArray(azione.avvisi?.oltre) ? azione.avvisi.oltre as AvvisoR4[] : [])
    const minacce = Array.isArray(azione.avvisi?.minacce) ? azione.avvisi.minacce as unknown[] : []
    if (minacce.length) {
        fuori.push({ tipo: 'avvisi', di: 'minacce', ruolo: 'alert', titolo: testoAutomazioniR4('sezioni.automations.v2.card.threatsTitle', lingua),
            righe: minacce.map((codice) => ({ testo: minacciaInParoleR4(codice, lingua), avviso: null })) })
    }
    if (oltre.length) {
        fuori.push({ tipo: 'avvisi', di: 'oltre', ruolo: null, titolo: testoAutomazioniR4('sezioni.automations.v2.card.beyondTitle', lingua),
            righe: oltre.map((a) => ({ testo: avvisoInParoleR4(a, lingua), avviso: a.codice ?? null })) })
    }
    return fuori
}

/**
 * Il blocco con la bozza. Crea: tutti i campi. Modifica: solo ciò che cambia, «prima → dopo». Riprendi: quando gira. Esegui ora: dove
 * e con che cosa gira, e il contesto in più se il modello ne ha passato uno. In testa, gli avvisi.
 */
export function bloccoCartaAutomazioneR4(azione: unknown, lingua: string): RigaBloccoR4[] {
    const a = (azione ?? {}) as Record<string, unknown> & { tipo?: string; avvisi?: { oltre?: unknown; minacce?: unknown } }
    const t = (k: string, v?: Record<string, unknown>) => testoAutomazioniR4(k, lingua, v)
    const riga = (campo: string, valore: unknown): RigaBloccoR4 => ({ tipo: 'riga', k: t(ETICHETTE[campo]), v: valoreInParoleR4(campo, valore, lingua) })
    const blocco = avvisi(a, lingua)
    if (a.tipo === 'automation_create') {
        const b = (a.bozza ?? {}) as Record<string, unknown>
        blocco.push(riga('pianificazione', b.pianificazione))
        blocco.push({ tipo: 'testo', k: t(ETICHETTE.istruzioni), testo: (b.istruzioni as string | undefined) ?? '' })
        for (const campo of ['cartella', 'modello', 'permessi', 'coordinazione', 'ripeti', 'prossimaEsecuzione']) {
            if (campo === 'prossimaEsecuzione' && (b.pianificazione as { tipo?: unknown } | undefined)?.tipo === 'manuale') continue
            blocco.push(riga(campo, b[campo]))
        }
    } else if (a.tipo === 'automation_update') {
        const prima = (a.prima ?? {}) as Record<string, unknown>
        const dopo = (a.dopo ?? {}) as Record<string, unknown>
        for (const campo of Object.keys(ETICHETTE)) {
            if (!(campo in dopo)) continue
            if (campo === 'istruzioni') { blocco.push({ tipo: 'testo', k: t(ETICHETTE.istruzioni), testo: (dopo.istruzioni as string | undefined) ?? '' }); continue }
            blocco.push({ tipo: 'riga', k: t(ETICHETTE[campo]), v: t('sezioni.automations.v2.card.change', { before: valoreInParoleR4(campo, prima[campo], lingua), after: valoreInParoleR4(campo, dopo[campo], lingua) }) })
        }
    } else if (a.tipo === 'automation_resume') {
        blocco.push(riga('pianificazione', (a.automazione as { pianificazione?: unknown } | undefined)?.pianificazione))
    } else if (a.tipo === 'automation_run') {
        const x = (a.automazione ?? {}) as Record<string, unknown>
        for (const campo of ['cartella', 'modello', 'permessi', 'coordinazione']) blocco.push(riga(campo, x[campo]))
        if (typeof a.contesto === 'string' && a.contesto) blocco.push({ tipo: 'testo', k: t('sezioni.automations.v2.card.context'), testo: a.contesto })
    }
    return blocco
}

/* ---- la carta dei fornitori (`fornitori-carta.js`) ---- */
interface CambioR4 { campo?: string; prima?: unknown; dopo?: unknown; modello?: unknown }
const cambiDi = (azione: { cambi?: unknown }): CambioR4[] => (Array.isArray(azione?.cambi)
    ? (azione.cambi as CambioR4[]).filter((c) => c && (c.campo === 'persona' || c.campo === 'di-serie')) : [])
const nomeModello = (id: unknown, lingua: string) => nomeModelloUmanoR4(id, lingua) || (typeof id === 'string' ? id : '') || ''

export function testiCartaFornitoriR4(azione: unknown, lingua: string): TestiCartaR4 {
    const a = (azione ?? {}) as { tipo?: string; email?: string; fornitore?: unknown; cambi?: unknown }
    const t = (k: string, v?: Record<string, unknown>) => testoAutomazioniR4(k, lingua, v)
    if (a.tipo === 'chatgpt_account') {
        return { badge: t('varie.providerCard.chatgptBadge'), bersaglio: a.email || 'ChatGPT', perche: t('varie.providerCard.chatgptDisconnect'), motivo: '', nota: '' }
    }
    const slug = typeof a.fornitore === 'string' ? a.fornitore : ''
    const cambi = cambiDi(a)
    const persona = cambi.some((c) => c.campo === 'persona')
    const serie = cambi.find((c) => c.campo === 'di-serie')
    const frase = a.tipo === 'provider_exclude'
        ? (persona ? 'varie.providerCard.exclude' : 'varie.providerCard.excludeForModel')
        : (persona && serie ? 'varie.providerCard.allowBoth' : persona ? 'varie.providerCard.allow' : 'varie.providerCard.allowForModel')
    return {
        badge: t('varie.providerCard.badge'),
        bersaglio: slug,
        perche: t(frase, { name: slug, model: serie ? nomeModello(serie.modello, lingua) : '' }),
        motivo: '',
        nota: persona ? t('varie.providerCard.everyModelNote') : '',
    }
}

/** Il blocco sotto la frase: chi è escluso adesso e chi lo sarà dopo il sì. */
export function bloccoCartaFornitoriR4(azione: unknown, lingua: string): RigaBloccoR4[] {
    const a = (azione ?? {}) as { tipo?: string; cambi?: unknown }
    const t = (k: string, v?: Record<string, unknown>) => testoAutomazioniR4(k, lingua, v)
    if (a.tipo === 'chatgpt_account') {
        return [{ tipo: 'riga', k: t('varie.providerCard.before'), v: t('varie.providerCard.chatgptNow') }, { tipo: 'riga', k: t('varie.providerCard.after'), v: t('varie.providerCard.chatgptAfter') }]
    }
    const nessuno = t('varie.providerCard.none')
    const stato = (attivo: boolean) => t(attivo ? 'varie.providerCard.excludedByDefault' : 'varie.providerCard.allowedAgain')
    const blocco: RigaBloccoR4[] = []
    for (const c of cambiDi(a)) {
        if (c.campo === 'persona') {
            const prima = Array.isArray(c.prima) && c.prima.length ? c.prima.join(', ') : nessuno
            const dopo = Array.isArray(c.dopo) && c.dopo.length ? c.dopo.join(', ') : nessuno
            blocco.push({ tipo: 'riga', k: t('varie.providerCard.before'), v: prima }, { tipo: 'riga', k: t('varie.providerCard.after'), v: dopo })
        } else {
            blocco.push({ tipo: 'riga', k: t('varie.providerCard.forModel', { model: nomeModello(c.modello, lingua) }), v: `${stato(c.prima === true)} → ${stato(c.dopo === true)}` })
        }
    }
    return blocco
}
