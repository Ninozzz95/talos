// @ts-check
/*
 * 0.2.4, cura dell'apice ANSI (owner riga 187; Forma 2 approvata dal giudice v2301): UN SOLO lettore di `$'…'` per il nucleo, soli builtin.
 * Lo usano la guardia dei percorsi (`path-policy.mjs`, dove viveva `decodificaAnsiC`), il lettore delle cancellazioni critiche
 * (`cancellazioni-critiche.mjs`, `comandiSemplici`) e il pavimento dei comandi (`pavimento-comandi.mjs`, `scansiona`).
 * La regola (manuale di bash 3.1.2.4 «ANSI-C Quoting»; POSIX 2024, Issue 8, «Dollar-Single-Quotes»): dentro `$'…'` la barra rovescia
 * protegge il carattere dopo, quindi `\'` NON chiude; `\n`, `\xHH`, `\NNN` ottale, `\uHHHH`, `\UHHHHHHHH`, `\cX` diventano il carattere.
 */

/**
 * L'indice dell'apice che chiude un `$'…'` il cui contenuto comincia in `da`, o -1 se l'apice resta aperto fino in fondo.
 * @param {string} testo
 * @param {number} da
 * @returns {number}
 */
export function chiusuraAnsiC(testo, da) {
  for (let j = da; j < testo.length; j += 1) {
    if (testo[j] === '\\') { j += 1; continue }
    if (testo[j] === "'") return j
  }
  return -1
}

/**
 * Il contenuto di `$'..'` come lo decodifica bash: `$'\x2eenv'` è `.env`, `$'\x2f'` è `/`. `fuoriScala`: ciò che vale un `\U` oltre Unicode.
 * `troncaAlNul`: il primo carattere zero (`\0`, `\x00`, `\u0000`, `\c@`) chiude il contenuto, come in bash (`lib/sh/strtrans.c`
 * `ansicstr` scrive una stringa C: `$'/\0x'` è `/`); POSIX 2024 lo lascia aperto, quindi chi legge tiene accanto anche l'altra lettura.
 * @param {string} s
 * @param {{ fuoriScala?: string, troncaAlNul?: boolean }} [opzioni]
 * @returns {string}
 */
export function decodificaAnsiC(s, { fuoriScala = '�', troncaAlNul = false } = {}) {
  /** @type {Record<string, string>} */
  const semplici = { a: '\u0007', b: '\b', e: '\u001b', E: '\u001b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
  let fuori = ''
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '\\' || i + 1 >= s.length) { fuori += s[i]; continue }
    const c = s[i + 1]
    let m
    if (semplici[c] !== undefined) { fuori += semplici[c]; i += 1 }
    else if ((m = /^x([0-9A-Fa-f]{1,2})/u.exec(s.slice(i + 1)))) { fuori += String.fromCodePoint(parseInt(m[1], 16)); i += m[0].length }
    else if ((m = /^u([0-9A-Fa-f]{1,4})/u.exec(s.slice(i + 1)))) { fuori += String.fromCodePoint(parseInt(m[1], 16)); i += m[0].length }
    else if ((m = /^U([0-9A-Fa-f]{1,8})/u.exec(s.slice(i + 1)))) { const n = parseInt(m[1], 16); fuori += n <= 0x10ffff ? String.fromCodePoint(n) : fuoriScala; i += m[0].length }
    else if ((m = /^[0-7]{1,3}/u.exec(s.slice(i + 1)))) { fuori += String.fromCodePoint(parseInt(m[0], 8) & 0xff); i += m[0].length }
    else if (c === 'c' && i + 2 < s.length) { fuori += String.fromCodePoint(s[i + 2] === '?' ? 0x7f : Number(s.codePointAt(i + 2)) & 0x1f); i += 2 } // bash: `\c?` è DEL
    else { fuori += '\\' + c; i += 1 }
  }
  const nul = troncaAlNul ? fuori.indexOf(String.fromCharCode(0)) : -1
  return nul === -1 ? fuori : fuori.slice(0, nul)
}
