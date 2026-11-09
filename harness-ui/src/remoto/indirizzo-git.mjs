/*
 * L'indirizzo di un remoto, per il dispositivo e per la conferma dell'invio (contratto `CONTRATTO-LISTA-BIANCA-PONTE-2026-10-31.md`, §5). Una funzione sola: ciò che la carta mostra è
 *   ciò che `invia` confronta, nella stessa forma.
 *
 * Le forme sono quelle di git (`urls.adoc`, letto il 31/10/2026): `<transport>::<address>` sceglie un aiutante, e `[user@]host:path` vale solo se nessuna barra viene prima dei primi due
 *   punti. La lettera di unità git su Windows la legge come cartella: `C:/Users/Anna Maria/r.git` non è l'host `C`.
 *
 * Non si pubblica niente che non si sa leggere. Di un indirizzo locale o di un aiutante resta solo l'impronta (8 cifre dello sha256), che basta a dire «è cambiato»: senza, due cartelle
 *   col nome finale uguale sembrerebbero la stessa destinazione. Query e frammento si trattano come le credenziali: spariscono, e non contano per il confronto.
 */
import { createHash } from 'node:crypto';

const SCHEMI_CON_HOST = new Set(['http', 'https', 'ssh', 'git', 'git+ssh', 'git+https']);
const impronta = (testo) => createHash('sha256').update(testo).digest('hex').slice(0, 8);
const ignoto = (testo) => `…#${impronta(testo)}`;
const senzaCoda = (testo) => testo.replace(/[?#].*$/su, '');

function indirizzoLocale(grezzo) {
  const pezzo = grezzo.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop();
  const nome = senzaCoda(pezzo);
  /* `u:parola@host` senza percorso arriva qui, e per git è davvero un'unità. N2: una `@` nel nome, anche dopo una coda, può essere una credenziale: quella forma non si mostra */
  return nome && nome !== '.' && nome !== '..' && !pezzo.includes('@') ? `…/${nome}#${impronta(grezzo)}` : ignoto(grezzo);
}
/* Una lettera di unità è tale se dopo non ci sono altri due punti, come per git (`url_is_local_not_ssh`, `is_valid_path`): `u:parola@host:r.git` è la forma scp con una parola, non `u:` */
const conLetteraDiUnita = (testo) => /^[A-Za-z]:(?:[\\/]|[^:]*$)/u.test(testo);

export function indirizzoPerIlDispositivo(grezzo) {
  if (typeof grezzo !== 'string' || grezzo === '') return null;
  const testo = grezzo.trim();
  const aiutante = /^([A-Za-z0-9][A-Za-z0-9+.-]*)::/u.exec(testo);
  if (aiutante) return `${aiutante[1]}::#${impronta(testo)}`;
  /* D3: una `@` dopo `#` o `?` si guarda prima di tagliare la coda, in ogni forma. `u:parola#x@host:r.git` e `host:r.git?t=a@b:gettone` hanno la stessa forma, e git non aiuta: per lui l'host è il
     primo pezzo (`connect.c`, `parse_connect_url`, `strchr(end, ':')`). `file://u:parola#x@host/r.git` e `https://parola#x@host/r.git` lascerebbero la parola nel nome o nell'host.
     Non si sa quale metà è il segreto, quindi non esce nessuna delle due. */
  if (/[?#].*@/su.test(testo)) return ignoto(testo);
  const schema = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//u.exec(testo)?.[1]?.toLowerCase();
  if (schema === 'file') return indirizzoLocale(senzaCoda(testo));
  if (schema) {
    if (!SCHEMI_CON_HOST.has(schema)) return ignoto(testo);
    /* N4 del Mobile: `new URL` legge `\\` come `/`, git no: `https://parola\\@host/r.git` per git è una credenziale. Fra lo schema e il primo `/`, `?` o `#` non si sa dove finisce */
    if (/^\/*[^/?#]*\\/u.test(testo.slice(testo.indexOf('://') + 3))) return ignoto(testo);
    try {
      const u = new URL(testo);
      u.username = ''; u.password = ''; u.search = ''; u.hash = '';
      return u.href;
    } catch { return ignoto(testo); }
  }
  const dueP = testo.indexOf(':');
  const barra = testo.search(/[\\/]/u);
  if (dueP === -1 || conLetteraDiUnita(testo) || (barra !== -1 && barra < dueP)) return indirizzoLocale(testo);
  const scp = /^(?:(.*)@)?([^@:/\\\s]+):(.+)$/su.exec(senzaCoda(testo));
  /* Una `@` rimasta nel percorso è una credenziale che la forma non separa: `https:u:parola@host/x` e `uu:parola@host/r.git` per git sono gli host `https` e `uu`, con la parola nel percorso.
     Prezzo: `git@host:a/b@v2.git`, raro, esce con la sola impronta */
  if (!scp || scp[3].includes('@')) return ignoto(testo);
  return `${scp[1] === 'git' ? 'git@' : ''}${scp[2]}:${scp[3]}`;
}

/** Un remoto può avere più indirizzi d'invio, e `git push` va a tutti: si mostrano e si confrontano tutti, nell'ordine di git. `null` se non ce n'è nessuno. */
export function indirizziPerIlDispositivo(lista) {
  const fuori = (Array.isArray(lista) ? lista : []).map(indirizzoPerIlDispositivo).filter(Boolean);
  return fuori.length ? fuori.join(', ') : null;
}
