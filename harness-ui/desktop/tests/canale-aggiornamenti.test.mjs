import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EVENTO_PAGINA, azioneAggiornamenti, copioneStato, statoPerLaPagina } from '../canale-aggiornamenti.mjs';

const G = 'a1b2c3d4e5f6';
const url = (q) => `talos-desktop://aggiornamenti?${q}`;

test('CANALE-01: le quattro azioni col gettone giusto', () => {
  assert.deepEqual(azioneAggiornamenti(url(`azione=controlla&gettone=${G}`), G), { valida: true, azione: 'controlla' });
  assert.deepEqual(azioneAggiornamenti(url(`azione=riavvia&gettone=${G}`), G), { valida: true, azione: 'riavvia' });
  assert.deepEqual(azioneAggiornamenti(url(`azione=nascondi&gettone=${G}`), G), { valida: true, azione: 'nascondi' });
  assert.deepEqual(azioneAggiornamenti(url(`azione=automatici&acceso=0&gettone=${G}`), G), { valida: true, azione: 'automatici', acceso: false });
  assert.deepEqual(azioneAggiornamenti(url(`azione=automatici&acceso=1&gettone=${G}`), G), { valida: true, azione: 'automatici', acceso: true });
});

test('CANALE-02: AL CONTRARIO — senza gettone, col gettone sbagliato, con un azione ignota: negato; un altro indirizzo non è affar suo', () => {
  for (const q of ['azione=riavvia', `azione=riavvia&gettone=${G}x`, 'azione=riavvia&gettone=', `azione=formatta&gettone=${G}`, `azione=automatici&gettone=${G}`, `azione=automatici&acceso=si&gettone=${G}`]) {
    assert.deepEqual(azioneAggiornamenti(url(q), G), { valida: false }, q);
  }
  assert.deepEqual(azioneAggiornamenti(`talos-desktop://aggiornamenti/altro?azione=controlla&gettone=${G}`, G), { valida: false });
  assert.deepEqual(azioneAggiornamenti(url('azione=controlla&gettone='), ''), { valida: false }, 'un gettone vuoto non è un gettone');
  for (const altro of ['talos-desktop://menu?x=1&y=2', 'https://github.com/Ninozzz95/talos/releases', 'non un indirizzo', null]) {
    assert.equal(azioneAggiornamenti(altro, G), null, String(altro));
  }
});

test('CANALE-03: il copione posa lo stato e lancia l evento — e un testo ostile nello stato resta testo', () => {
  const stato = statoPerLaPagina({ versioneAttuale: '0.1.20', stato: 'errore', errore: '"); alert(1); (" </script>', automatici: true }, { attivo: true, gettone: G });
  const eventi = [];
  const finestra = { dispatchEvent: (e) => eventi.push(e) };
  vm.runInNewContext(copioneStato(stato), { window: finestra, CustomEvent: class { constructor(tipo, { detail }) { this.type = tipo; this.detail = detail; } } });
  assert.equal(JSON.stringify(finestra.__talosAggiornamenti), JSON.stringify(stato), 'stesso contenuto (l oggetto nasce in un altro contesto vm)');
  assert.equal(eventi.length, 1);
  assert.equal(eventi[0].type, EVENTO_PAGINA);
  assert.equal(eventi[0].detail.errore, '"); alert(1); (" </script>');
});

test('CANALE-04: lo stato per la pagina — spento con il suo motivo, acceso senza', () => {
  assert.deepEqual(statoPerLaPagina(null, { attivo: false, motivoSpento: 'preview', gettone: G }), {
    attivo: false, motivoSpento: 'preview', versioneAttuale: null, stato: 'fermo', automatici: true, ultimoControllo: null, pronto: null, errore: null, nascosto: false, gettone: G,
  });
  assert.equal(statoPerLaPagina({ stato: 'pronto' }, { attivo: true, motivoSpento: 'ignorato', gettone: G }).motivoSpento, null);
});
