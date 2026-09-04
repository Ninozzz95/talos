#!/usr/bin/env node
/**
 * Le prove del cancello della ricerca web.
 *
 * ⛔ Un cancello si prova nei DUE versi: che blocchi davvero chi scrive senza
 * aver cercato, e che NON blocchi tutto il resto — perché un cancello che
 * nega troppo viene disattivato, e un cancello disattivato non esiste.
 */
import { eCodiceDiProdotto, eRicerca, serveRicerca } from './ricerca-prima-di-scrivere.mjs'

let falliti = 0
const p = (nome, atteso, avuto) => {
    const ok = JSON.stringify(atteso) === JSON.stringify(avuto)
    if (ok) console.log(`  ok       ${nome}`)
    else { falliti += 1; console.log(`  NO       ${nome}  — atteso ${JSON.stringify(atteso)}, avuto ${JSON.stringify(avuto)}`) }
}

console.log('Cancello della ricerca web:')

// --- cosa è codice di prodotto ---
p('il sorgente del server è codice', true, eCodiceDiProdotto('C:/…/harness-ui/src/session-store.mjs'))
p('il monolite del browser è codice', true, eCodiceDiProdotto('C:/…/harness-ui/public/app.js'))
p('un test è codice (scrivere un test è un passo implementativo)', true, eCodiceDiProdotto('C:/…/harness-ui/tests/x.test.mjs'))
p('un componente del mobile è codice', true, eCodiceDiProdotto('C:/…/mobile/src/App.vue'))
p('un documento del ledger NON è codice', false, eCodiceDiProdotto('C:/…/.claude/LEDGER-ROADMAP.md'))
p('un hook NON è codice di prodotto (o non si potrebbe ripararlo)', false, eCodiceDiProdotto('C:/…/.claude/hooks/cancelli.mjs'))
p('uno script usa-e-getta nella cartella temporanea NON è codice', false, eCodiceDiProdotto('C:/Users/x/AppData/Local/Temp/claude/sonda.mjs'))
p('un README NON è codice', false, eCodiceDiProdotto('C:/…/harness-ui/README.md'))
p('un percorso vuoto non è niente', false, eCodiceDiProdotto(''))

// --- cosa conta come ricerca ---
p('WebSearch è una ricerca', true, eRicerca({ name: 'WebSearch' }))
p('WebFetch è una ricerca', true, eRicerca({ name: 'WebFetch' }))
p('ctx7 da Bash è una ricerca di documentazione', true, eRicerca({ name: 'Bash', command: 'npx ctx7@latest docs /vercel/next.js routing' }))
p('un Bash qualunque NON è una ricerca', false, eRicerca({ name: 'Bash', command: 'npm run verify:all' }))
p('leggere un file NON è una ricerca', false, eRicerca({ name: 'Read', command: 'src/app.js' }))

// --- la decisione ---
const scritturaCodice = { strumento: 'Edit', percorso: 'C:/…/harness-ui/src/config.mjs' }
p('scrivo codice e non ho cercato: BLOCCA', true, serveRicerca({ ...scritturaCodice, eventi: [{ name: 'Read' }, { name: 'Bash', command: 'git status' }] }))
p('scrivo codice DOPO una ricerca: passa', false, serveRicerca({ ...scritturaCodice, eventi: [{ name: 'WebSearch' }, { name: 'Read' }] }))
p('scrivo codice dopo ctx7: passa', false, serveRicerca({ ...scritturaCodice, eventi: [{ name: 'Bash', command: 'npx ctx7@latest library react' }] }))
p('scrivo un documento senza ricerca: passa (non è codice)', false, serveRicerca({ strumento: 'Write', percorso: 'C:/…/.claude/RIPRESA.md', eventi: [] }))
p('leggo soltanto: passa (non è una scrittura)', false, serveRicerca({ strumento: 'Read', percorso: 'C:/…/harness-ui/src/config.mjs', eventi: [] }))
p('un comando Bash non passa da qui', false, serveRicerca({ strumento: 'Bash', percorso: '', eventi: [] }))
p('nessun evento e scrittura di codice: BLOCCA', true, serveRicerca({ ...scritturaCodice, eventi: [] }))
p('eventi assenti del tutto: BLOCCA lo stesso', true, serveRicerca({ ...scritturaCodice, eventi: undefined }))

// ⛔ 04/9 — il caso che ha rotto tutto: nel transcript di un AGENTE ogni
// risultato di strumento è un messaggio `user` con contenuto testuale, e
// `eventiDelTurno` azzerava il conto ogni volta. Risultato: negava sempre,
// anche a chi aveva appena cercato. Questi due casi lo pinnano.
const { eventiRecenti } = await import('./ricerca-prima-di-scrivere.mjs')

const transcriptAgente = [
  JSON.stringify({ type: 'user', message: { content: 'fai la riga W1-02' } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'stato dell arte' } }] } }),
  JSON.stringify({ type: 'user', message: { content: 'risultato della ricerca: ...' } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/x.mjs' } }] } }),
  JSON.stringify({ type: 'user', message: { content: 'contenuto del file ...' } }),
].join('\n')

p('AGENTE — la ricerca resta visibile anche dopo i risultati degli strumenti', true, eventiRecenti(transcriptAgente).some((e) => e.name === 'WebSearch'))
p('AGENTE — e quindi il cancello NON blocca chi ha cercato', false, serveRicerca({ strumento: 'Edit', percorso: 'C:/…/harness-ui/src/config.mjs', eventi: eventiRecenti(transcriptAgente) }))
p('AL CONTRARIO — un transcript senza nessuna ricerca blocca comunque', true, serveRicerca({ strumento: 'Edit', percorso: 'C:/…/harness-ui/src/config.mjs', eventi: eventiRecenti(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } })) }))

console.log(falliti === 0 ? '\nTutte verdi (compresi i casi dell\'agente).' : `\n${falliti} PROVE FALLITE.`)
process.exit(falliti === 0 ? 0 : 1)
