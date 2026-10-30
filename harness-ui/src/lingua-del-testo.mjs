/*
 * La lingua di un messaggio SCRITTO (owner 28/10/2026 sera, «Libreria ELD nell'app»). Chi detta la sa già (il riconoscitore vocale del PC,
 * quello del telefono) e la manda in `linguaDelMessaggio`; per il testo scritto la riconosce il server, così vale per il PC e per ogni
 * dispositivo collegato senza un riconoscitore suo. Il nucleo ne fa la nota «The person's last message is in X: reply in X.» in coda
 * alla richiesta, solo in Automatica.
 *
 * Perché serve: il Mobile ha MISURATO sul Pad il 28/10 che la sola regola «rispondi nella lingua di chi scrive» non basta ai modelli
 * piccoli (gemma-4-E2B in una chat lunga in italiano rispondeva in italiano a una domanda in persiano; granite-4.2 rispondeva «Paris.» in
 * inglese a una domanda in italiano), e che la nota che NOMINA la lingua li corregge. Nessun concorrente lo fa: Hermes
 * (`agent/title_generator.py:115-116`), Open WebUI, LibreChat, Lobe, Gemini CLI e Codex si fermano alla regola. Il LanguageDetector di
 * Chrome dentro Electron risponde «Model not available» (electron/electron#48567).
 *
 * ELD 2.1.0 (Apache-2.0, nessuna dipendenza, 60 lingue), dizionario «extrasmall». Misurato il 28/10 su 63 frasi da chat con TALOS: si
 * carica in ~85 ms la prima volta e occupa ~45 MB (i dizionari più grandi non sono più precisi: 88-95 MB per la stessa resa), poi
 * ~0,1 ms per frase. ⛔ Da solo dà per sicuri anche degli errori, proprio sul caso dell'owner: «سلام، حالت چطوره؟» (persiano) → arabo,
 * col persiano a 0,002 di distanza; e norvegese → danese, turco → azero. Due difese, misurate:
 *   1. per l'alfabeto arabo decidono le lettere che l'arabo non ha (پ چ ژ گ ی ک, «tongue» smista allo stesso modo per alfabeto prima del
 *      modello), salvo le lettere dell'urdu e del curdo sorani;
 *   2. la lingua si dice solo se il primo punteggio stacca il secondo di almeno `MARGINE_MINIMO`: con 0,05, 47 frasi su 63 hanno la loro
 *      lingua e ZERO sono sbagliate (con margine 0: 58 su 63 e 3 sbagliate). Meglio nessuna nota che «reply in Danish» a un norvegese.
 * Il testo che non è lingua (blocchi di codice, codice in linea, indirizzi) si toglie prima: tirerebbe tutto verso l'inglese.
 *
 * ⛔ Revisione avversaria del blocco 14 (RIV14-1, S1, 28/10/2026): sui messaggi VERI di chi programma in italiano il riconoscitore sbagliava
 *   13 frasi su 40 — «refactor del componente Sidebar» → spagnolo, «implementa la feature dark mode nel frontend» → francese, una parola
 *   citata in persiano o in cirillico decideva per tutto il messaggio, un errore incollato senza recinto → inglese, l'arabo con una ی e il
 *   pashto → persiano. Tre cause, tre cure:
 *   a. le scorciatoie per alfabeto guardano la PREVALENZA (almeno il 60% delle lettere), non la presenza di una lettera; il persiano no se ci
 *      sono lettere che solo l'arabo (ة ي ك ى) o il pashto (ټ ډ ړ ږ ښ ځ څ ۍ ې ګ ڼ) usano;
 *   b. il margine sale a 0,10: gli sbagliati stavano a 0,074-0,089, sotto il rumore del gergo inglese dentro l'italiano;
 *   c. si tolgono anche le righe di stack (`at …`) e i gettoni di codice fuori dal recinto (percorsi, `a.b`, camelCase, parentesi, `=`,
 *      MAIUSCOLE da errore), dopo aver tolto la punteggiatura ai bordi.
 *   Misura sul corpus delle 63 frasi di prima più le 40 del revisore, nel commit. Si perdono alcune frasi brevi giuste: è il verso giusto
 *   dell'errore («meglio nessuna nota che una sbagliata»).
 */

export const MARGINE_MINIMO = 0.10
export const LETTERE_MINIME = 6
/** Da quante lettere la cornice o l'ultima riga contano come voce della persona («ok:» no, «Aiuto:» sì; R17-1). */
const LETTERE_DELLA_VOCE = 3
const LETTERE_PERSIANE = /[پچژگیک]/u // پ چ ژ گ ی ک
const LETTERE_URDU = /[ھہےٹڈڑ]/u // ھ ہ ے ٹ ڈ ڑ
/* il curdo sorani scrive con le stesse lettere persiane, più queste sue: lì decide ELD (che conosce «ku») */
const LETTERE_CURDE = /[ڕڵۆێە]/u // ڕ ڵ ۆ ێ ە
const ALFABETO_ARABO = /[؀-ۿ]/u
const LETTERE_SOLO_ARABE = /[ةيكى]/u // ة ي ك ى (l'arabo; il persiano usa ی ک)
const LETTERE_PASHTO = /[ټډړږښځڅۍېګڼ]/u
const QUOTA_ALFABETO = 0.6
/** La parte delle lettere del testo che sta nell'alfabeto dato (0-1). */
function quota(testo, alfabeto) {
  const lettere = (testo.match(/\p{L}/gu) ?? []).length
  return lettere === 0 ? 0 : (testo.match(new RegExp(alfabeto.source, 'gu')) ?? []).length / lettere
}
/* un gettone di codice: separatori da percorso o da sintassi, `a.b`, camelCase, o tutto MAIUSCOLO da errore (ERESOLVE, ERR_X) */
const GETTONE_DI_CODICE = /[/\\_<>{}[\]=();:]|\w\.\w|\p{Ll}\p{Lu}|^[\p{Lu}0-9_]{2,}$/u
const BORDI = /^[(\[«"'“‘]+|[)\]»"'”’.,;:!?]+$/gu
/* Cirillico (28/10, misurato): ELD indovina russo, ucraino e bulgaro ma con margini di 0,014-0,025, sotto la soglia — senza questo nessuna
   frase cirillica avrebbe la sua lingua. Decidono le lettere che solo una di quelle lingue usa. */
const ALFABETO_CIRILLICO = /[Ѐ-ӿ]/u
const LETTERE_UCRAINE = /[іїєґІЇЄҐ]/u
const LETTERE_SERBE = /[ђћџљњјЂЋЏЉЊЈ]/u
const LETTERE_RUSSE = /[ыэёЫЭЁ]/u
/* Revisione del blocco 17 (R17-2, 28/10/2026): il bulgaro usa la ъ come VOCALE («към», «съм»); il russo solo come segno davanti a е ё ю я
   («объясни», «подъезд»), e lì non dice niente. */
const LETTERE_BULGARE = /[ъЪ](?![еёюяЕЁЮЯ])/u
/* …e il kazako, il tagiko, il kirghiso e il mongolo hanno lettere loro (ә ғ қ ң ө ұ ү һ ӣ ӯ ҳ ҷ): una sola basta a non scegliere russo o
   ucraino al posto loro (prima «Сәлеметсіз…» diventava ucraino e «…мехоҳам, ёрӣ диҳед» russo) */
const LETTERE_DI_ALTRE_LINGUE_CIRILLICHE = /[әғқңөұүһӣӯҳҷӘҒҚҢӨҰҮҺӢӮҲҶ]/u
function linguaCirillica(testo) {
  if (LETTERE_DI_ALTRE_LINGUE_CIRILLICHE.test(testo)) return null
  const ucraino = LETTERE_UCRAINE.test(testo), serbo = LETTERE_SERBE.test(testo), russo = LETTERE_RUSSE.test(testo)
  if (ucraino && !serbo && !russo) return 'uk'
  if (serbo && !ucraino && !russo) return 'sr'
  if (russo && !ucraino && !serbo) return 'ru'
  if (LETTERE_BULGARE.test(testo) && !ucraino && !serbo && !russo) return 'bg'
  return null
}

let caricamento = null

/** Il riconoscitore, caricato una volta sola al primo uso. `null` se il pacchetto non c'è (chi importa questo modulo senza `eld`). */
async function rilevatore({ importaEld = () => import('eld') } = {}) {
  caricamento ??= (async () => {
    try {
      const { eld } = await importaEld()
      const istanza = eld.newInstance()
      await istanza.load('extrasmall')
      return istanza
    } catch {
      caricamento = null // S4-2 (revisione blocco 14): un caricamento fallito si ritenta al messaggio dopo, non resta `null` per sempre
      return null
    }
  })()
  return caricamento
}

/** Il testo senza blocchi di codice, codice in linea e indirizzi: i loro due punti non sono la voce di nessuno. */
function senzaCodiceNeIndirizzi(testo) {
  return String(testo ?? '')
    .replace(/```[\s\S]*?(```|$)/gu, ' ')
    .replace(/`[^`\n]*`/gu, ' ')
    .replace(/\bhttps?:\/\/\S+/giu, ' ')
}

/** Il testo che conta per la lingua: senza blocchi di codice, codice in linea e indirizzi. */
export function testoDaRiconoscere(testo) {
  return senzaCodiceNeIndirizzi(testo)
    .replace(/^\s*at .*$/gmu, ' ') // righe di stack incollate senza recinto (RIV14-1)
    .split(/\s+/u).filter((g) => g && !GETTONE_DI_CODICE.test(g.replace(BORDI, ''))).join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** La decisione su un testo già ripulito, col riconoscitore pronto (pura, per le prove). */
export function decidiLingua(testo, istanza) {
  const lettere = (testo.match(/\p{L}/gu) ?? []).length
  if (lettere < LETTERE_MINIME) return null
  if (quota(testo, ALFABETO_ARABO) >= QUOTA_ALFABETO && LETTERE_PERSIANE.test(testo) && !LETTERE_URDU.test(testo) && !LETTERE_CURDE.test(testo)
    && !LETTERE_SOLO_ARABE.test(testo) && !LETTERE_PASHTO.test(testo)) return 'fa'
  if (quota(testo, ALFABETO_CIRILLICO) >= QUOTA_ALFABETO) { const cirillica = linguaCirillica(testo); if (cirillica) return cirillica }
  if (!istanza) return null
  const esito = istanza.detect(testo)
  if (!esito?.language || !esito.isReliable()) return null
  const [primo = 0, secondo = 0] = Object.values(esito.getScores() ?? {}).sort((a, b) => b - a)
  return primo - secondo >= MARGINE_MINIMO - 1e-9 ? esito.language : null // il margine esatto vale (0,8 − 0,7 = 0,0999… in virgola mobile)
}

/** La lingua (codice ISO 639-1) di un messaggio scritto, o `null` se non si sa con sicurezza. Non lancia mai. */
export async function linguaDelTesto(testo, opzioni = {}) {
  try {
    /* Riverifica del blocco 14 (RIV14B-L1, S1, 28/10/2026): un passo CITATO («…», "…", “…”) non è la voce di chi scrive */
    const senzaCitazioni = String(testo ?? '').replace(/«[^»]*»|"[^"\n]*"|“[^”]*”/gu, ' ')
    const pulito = testoDaRiconoscere(senzaCitazioni)
    if ((pulito.match(/\p{L}/gu) ?? []).length < LETTERE_MINIME) return null
    const istanza = await rilevatore(opzioni)
    const tutto = decidiLingua(pulito, istanza)
    /* …e la cornice prima dei primi due punti («il build dice: …», «traduci: …») è la voce della persona: se ha abbastanza lettere e dice
       un'altra lingua, quello che segue è incollato ⇒ nessuna nota (9 errori inglesi incollati su 10 erano «inglese» per il riconoscitore) */
    /* Dal Mobile, 28/10/2026: i due punti di un indirizzo («check this out https://… e dimmi…»), di un percorso (C:\) o di un orario
       (12:30) non chiudono una cornice. Contano solo quelli fuori da codice e indirizzi, seguiti da uno spazio o dalla fine del testo. */
    /* Revisione del blocco 17 (R17-1, S2, 28/10/2026): «Aiuto: <errore inglese>», «fixa il build: …», «**Errore:** …» e l'errore incollato
       PRIMA della domanda davano ancora «reply in English». Due cure:
       · una voce della persona di almeno 3 lettere che non si decide CON il margine (troppo corta, o gergo che tira verso l'inglese) non
         conferma niente ⇒ nessuna nota; prima si ripiegava sulla stima grezza del riconoscitore, senza margine;
       · la voce è la cornice prima dei due punti (anche in grassetto, «**Errore:**») e, in un messaggio di più righe, l'ULTIMA riga. */
    const perLaCornice = senzaCodiceNeIndirizzi(senzaCitazioni)
    if (tutto) {
      const duePunti = perLaCornice.search(/:(?=[\s*_]|$)/u)
      const righe = perLaCornice.split(/\n/u).map((r) => r.trim()).filter((r) => /\p{L}/u.test(r))
      /* la cornice conta da 3 lettere («Aiuto:»); l'ultima riga da 6, come il messaggio intero («vedi <indirizzo>» non è una voce) */
      const voci = [[duePunti > 0 ? perLaCornice.slice(0, duePunti) : null, LETTERE_DELLA_VOCE], [righe.length > 1 ? righe[righe.length - 1] : null, LETTERE_MINIME]]
      for (const [voce, minime] of voci) {
        const pulita = voce === null ? '' : testoDaRiconoscere(voce)
        if ((pulita.match(/\p{L}/gu) ?? []).length < minime) continue
        const suaLingua = decidiLingua(pulita, istanza)
        if (suaLingua === tutto) continue
        /* una voce INDECISA nello stesso alfabeto non latino del messaggio («Привет! Мне нужна помощь: …») non può essere un errore inglese
           incollato: non toglie niente. Toglie la nota solo se decide un'altra lingua. */
        const stessoAlfabeto = [ALFABETO_ARABO, ALFABETO_CIRILLICO].some((a) => quota(pulita, a) >= QUOTA_ALFABETO && quota(pulito, a) >= QUOTA_ALFABETO)
        if (suaLingua === null && stessoAlfabeto) continue
        return null
      }
    }
    return tutto
  } catch {
    return null
  }
}

/** Solo per le prove: dimentica il riconoscitore caricato. */
export function _dimenticaRilevatore() { caricamento = null }
