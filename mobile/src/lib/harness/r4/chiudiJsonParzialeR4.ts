/* Giro 2 delle maschere (0.1.50 P5): PORTO copiato, non riscritto, di `harness-ui/frontend/src/components/carta-dal-testo.js:81-115`
   (nato in 070f771e1); solo i tipi aggiunti. Si importa il PC? No: porta `lingua.js` e le etichette della pagina. Parità: chiudiJsonParzialeR4.test.ts */
const SPAZIO = /\s/u; // gli stessi spazi di `trimEnd` (WhiteSpace e LineTerminator)
export function chiudiJsonParziale(testo: string): string {
  const pila: string[] = [];
  let inTesto = false, barra = false, nome = false, inizio = -1, ultimo = '', inizioChiuso = -1, fineChiuso = -1;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inTesto) {
      if (barra) barra = false;
      else if (c === '\\') barra = true;
      else if (c === '"') { inTesto = false; inizioChiuso = inizio; fineChiuso = i; ultimo = c; }
      continue;
    }
    if (c === '"') {
      inTesto = true;
      inizio = i;
      nome = pila.at(-1) === '{' && (ultimo === '{' || ultimo === ',');
    } else if (c === '{' || c === '[') pila.push(c);
    else if (c === '}' || c === ']') pila.pop();
    if (!SPAZIO.test(c)) ultimo = c;
  }
  let fuori: string;
  if (inTesto && nome) fuori = testo.slice(0, inizio); // un nome a metà: via, il suo valore non è ancora arrivato
  else if (inTesto) fuori = `${testo.slice(0, inizio)}"…"`; // un valore aperto: «…» finché non si chiude, mai un suo pezzo
  else {
    fuori = testo.trimEnd();
    if (fuori.endsWith(':')) { // un nome senza valore: via (l'ultimo testo chiuso, se fra lui e i due punti ci sono solo spazi)
      let j = fuori.length - 2;
      while (j >= 0 && SPAZIO.test(fuori[j])) j -= 1;
      if (j === fineChiuso) fuori = fuori.slice(0, inizioChiuso);
    }
  }
  fuori = fuori.trimEnd();
  if (fuori.endsWith(',')) fuori = fuori.slice(0, -1);
  return fuori + pila.reverse().map((p) => (p === '{' ? '}' : ']')).join('');
}
