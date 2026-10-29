/*
 * «Segnala un problema», revisione D del 29/10/2026 (F3): ciò che la PERSONA scrive nella finestra non si riscrive mai — è il suo testo.
 *   Prima di «Apri su GitHub», se titolo, descrizione o diagnostica hanno la FORMA di una chiave o di un percorso assoluto, la finestra lo
 *   dice in una riga; il pulsante resta attivo.
 * ⛔ Le forme sono le stesse della pulizia del server (`src/segnalazione-problema.mjs`, che a sua volta usa `src/forme-di-segreto.mjs`,
 *   lo specchio di `redact.ts` della CLI), riscritte qui perché il pacchetto del frontend non importa il server. Che restino le stesse
 *   lo pretende `tests/segnalazione-forme-parita.test.mjs`: lo stesso campionario passa dai due lati e deve dare la stessa risposta.
 */
const T = 'A-Za-z0-9_\\-';
const confinata = (sorgente) => new RegExp(`(?<![${T}])(?:${sorgente})(?![${T}])`, 'u');

/* `forme-di-segreto.mjs` (FORME_DI_SEGRETO), qui senza l'eccezione dei segnaposto noti: in una pagina pubblica non si distinguono */
const CHIAVI = [
  /-{5}BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-{5}/u,
  confinata('eyJ[A-Za-z0-9_-]{8,4096}\\.eyJ[A-Za-z0-9_-]{8,8192}\\.[A-Za-z0-9_-]{10,4096}'),
  confinata('sk-(?=[A-Za-z0-9_-]{0,255}\\d)[A-Za-z0-9_-]{20,256}'),
  confinata('gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{30,255}'),
  confinata('gl(?:pat|oas|dt|rtr|rt|cbt|ptt|ft|imt|agent|wt|soat|ffct)-[A-Za-z0-9_-]{20,255}'),
  confinata('xox[abprs]-[A-Za-z0-9-]{10,255}|xapp-[A-Za-z0-9-]{10,255}'),
  confinata('AIza[A-Za-z0-9_-]{35,64}'),
  confinata('(?:AKIA|ASIA)[A-Z0-9]{16}'),
  confinata('hf_[A-Za-z0-9]{30,255}|npm_[A-Za-z0-9]{36,255}'),
  /(?<![A-Za-z0-9])bearer[ \t]+(?=[A-Za-z0-9._~+/-]{0,4095}\d)[A-Za-z0-9._~+/-]{20,4096}=*(?![A-Za-z0-9._~+/=-])/iu,
  confinata('gsk_[A-Za-z0-9]{20,255}'),
  confinata('(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,255}'),
  confinata('xai-[A-Za-z0-9]{30,255}'),
  /(\b[a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/@:"']{1,256}:[^\s/@"']{1,256}@/iu,
  /* Z.AI (revisione D, F2; nell'elenco condiviso dal 29/10) */
  confinata('[0-9a-f]{32}\\.[A-Za-z0-9]{16,64}'),
  /* il valore dopo un NOME di segreto (revisione D, F1; `VALORE_DOPO_UN_NOME_DI_SEGRETO` del server): i contatori `*_tokens` restano */
  /(?<![A-Za-z0-9])(?:(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd)|(?:[A-Za-z0-9]+[_-])+key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s;,]+)/iu,
];
/* i percorsi assoluti (`PERCORSI` del server) */
const PERCORSI = [
  /\bfile:\/\/\/?[^\s"'<>]*/iu,
  /(?<![\p{L}\p{N}_])[A-Za-z]:[\\/][^\s"'<>|]*/u,
  /\\\\[^\s\\"'<>|]+\\[^\s"'<>|]*/u,
  /(?<![\p{L}\p{N}_.:/~-])~[\\/][^\s"'<>|]*/u,
  /(?<![\p{L}\p{N}_.:/~-])\/(?:[^\s/"'<>|]+\/)+[^\s/"'<>|]*/u,
  /(?<![\p{L}\p{N}_])[\p{L}\p{N}_.-]+(?:\\[\p{L}\p{N}_.-]*)+/u,
];
/* I segnaposto che la pulizia del server ha già messo (`[path]`, `[redacted]`) non sono un percorso né una chiave. */
const SEGNAPOSTO = /\[(?:path|redacted|user|pc|email)\]/gu;

/** Il testo ha la forma di una chiave o di un percorso assoluto? */
export function sembraChiaveOPercorso(testo) {
  if (typeof testo !== 'string' || testo === '') return false;
  const senzaSegnaposto = testo.replace(SEGNAPOSTO, ' ');
  return CHIAVI.some((forma) => forma.test(senzaSegnaposto)) || PERCORSI.some((forma) => forma.test(senzaSegnaposto));
}
