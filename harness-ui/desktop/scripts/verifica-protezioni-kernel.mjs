import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/*
 * ⛔ 27/09/2026 (owner): le protezioni che il rattoppo `desktop-critical-tools-2026-09-15-v1` applicava al kernel SOLO
 * nello staging del pacchetto ora stanno DENTRO `src/kernel/talosHarness.mjs`, cosi' il 4174 prova esattamente cio' che
 * si rilascia. Qui resta il controllo: se il kernel ne perde una, il pacchetto non si costruisce invece di partire senza.
 * T-04 (rifiutare `prova` con codice libero) non si e' portata come schema vuoto: dal 05/10/2026 (owner) lo schema di
 * `prova` ha i DUE campi additivi di BUG-3/BUG-14 (`timeout`, `background` — sfonda invece di uccidere, output su file);
 * il controllo accetta SOLO quelli e nessun altro argomento del modello.
 */
export const PROTEZIONI_KERNEL = Object.freeze([
  {
    id: 'T-01',
    descrizione: 'cerca: zero risultati dopo una ricerca incompleta non si dicono «no file matches»',
    presente: (k) => k.includes("const RICERCA_NON_CONCLUSIVA = 'inconclusive search:")
      && (k.match(/esitoSenzaRisultati\(avvisi, /g) ?? []).length >= 2,
  },
  {
    id: 'T-02',
    descrizione: 'cerca (camminata JS): i file troppo grandi si dicono per nome',
    presente: (k) => k.includes('fileTroppoGrandi.push(p)') && k.includes('file(s) were skipped because they exceed'),
  },
  {
    id: 'RG',
    descrizione: 'cerca (ripgrep): nessun file saltato in silenzio per la taglia',
    /* L'assenza da sola passerebbe su qualunque file: la ricerca ripgrep deve ESSERCI, e senza tetto di taglia. */
    presente: (k) => k.includes('async function cercaConRipgrep(') && !k.includes("'--max-filesize'"),
  },
  {
    id: 'T-03',
    descrizione: 'uscita degli attrezzi senza motore del contesto: taglio dichiarato',
    presente: (k) => !k.includes('String(esito).slice(0, 8_000)') && k.includes('uscitaUtile(String(esito), 8_000, 0.5)'),
  },
  {
    /* ⛔ 05/10/2026 (owner): BUG-3/BUG-14 (3ec7cafea) hanno aggiunto a `prova` i campi additivi `timeout` e
       `background` (sfonda invece di uccidere; output su file). L'INTENTO di T-04 resta fermo — nessun argomento
       libero dal modello, niente codice — ma lo schema accetta SOLO quei due campi, e nessun altro. */
    id: 'T-04',
    descrizione: 'prova: nessun argomento libero dal modello — solo timeout/background (BUG-3/BUG-14)',
    presente: (k) => {
      const inizio = k.indexOf("name: 'prova',")
      if (inizio < 0) return false
      const seguente = k.indexOf("name: '", inizio + "name: 'prova',".length)
      const blocco = k.slice(inizio, seguente < 0 ? k.length : seguente)
      const schema = blocco.match(/input_schema: \{\s*type: 'object',\s*properties: \{([\s\S]*?)\},\s*required: \[\]/)
      if (!schema) return false
      const chiavi = [...schema[1].matchAll(/^\s+([A-Za-z_]\w*): \{/gm)].map((m) => m[1])
      return chiavi.length === 2 && chiavi[0] === 'timeout' && chiavi[1] === 'background'
    },
  },
])

export function verificaProtezioniKernel(sorgente) {
  const testo = String(sorgente)
  const mancanti = PROTEZIONI_KERNEL.filter((protezione) => !protezione.presente(testo))
  if (mancanti.length > 0) {
    throw new Error(`Protezioni assenti nel kernel: ${mancanti.map((p) => `${p.id} (${p.descrizione})`).join('; ')}.`)
  }
  return PROTEZIONI_KERNEL.map((protezione) => protezione.id)
}

export async function verificaProtezioniStaging({ desktopRoot } = {}) {
  const root = desktopRoot ? resolve(desktopRoot) : dirname(dirname(fileURLToPath(import.meta.url)))
  const kernel = join(root, '.staging', 'harness-ui', 'src', 'kernel', 'talosHarness.mjs')
  return verificaProtezioniKernel(await readFile(kernel, 'utf8'))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verificaProtezioniStaging().then((ids) => {
    console.log(`Protezioni del kernel verificate nello staging: ${ids.join(', ')}.`)
  }).catch((errore) => {
    console.error(`Pacchetto fermato: ${errore instanceof Error ? errore.message : String(errore)}`)
    process.exitCode = 1
  })
}
