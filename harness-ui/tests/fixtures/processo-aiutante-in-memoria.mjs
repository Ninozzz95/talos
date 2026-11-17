/*
 * Un processo dell'aiutante del computer use tutto in memoria, per le prove del segno rifiutato (giudice v1793-v1794, 13/11/2026): nessun processo vero,
 * nessuno schermo. Parla MCP a righe come cua (`initialize`, `tools/call`), e fa le tre cose che servono alle prove:
 *  - `trattieni`: i nomi degli strumenti la cui risposta resta in sospeso finché la prova chiama `rilascia(nome)` (una chiamata «in volo»);
 *  - i gettoni degli elementi valgono SOLO nel processo che li ha dati, come in cua (`cua-driver-core/src/element_token.rs:64`, «element_token is stale or
 *    unknown; call get_window_state again to refresh»): un processo nuovo rifiuta il gettone del vecchio, non clicca altrove;
 *  - `chiuso` diventa vero quando il cliente chiude l'ingresso (la chiusura della specifica su stdio), `ucciso` quando lo uccide.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Senza titolo - Blocco note', bounds: { x: 0, y: 0, width: 1280, height: 720 },
  z_index: 5, is_on_screen: true, minimized: false };

/** I primi 24 byte di un PNG: firma, IHDR, larghezza e altezza. Bastano all'attrezzo per leggerne le dimensioni. */
export function png(larghezza, altezza) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(larghezza, 16); b.writeUInt32BE(altezza, 20);
  return b;
}

const statoNotepad = () => ({ window_title: FINESTRA.title, app_name: FINESTRA.app_name, window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Document', label: 'Editor di testo', frame: { x: 10, y: 60, w: 1200, h: 600 } }] });

/** `alRicevere(nome)`: chiamata quando arriva una `tools/call`, PRIMA della risposta (che parte al giro dopo): la chiamata è in volo. */
export function processoAiutanteInMemoria({ trattieni = [], alRicevere = null } = {}) {
  const f = new EventEmitter();
  f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.stderr = new PassThrough();
  f.chiuso = false; f.ucciso = false; f.ricevute = []; f.inSospeso = new Map(); f.exitCode = null;
  const gettoni = new Set();
  const tienili = new Set(trattieni);
  const manda = (m) => { if (!f.ucciso) f.stdout.write(`${JSON.stringify(m)}\n`); };
  const risultato = (nome, args) => {
    if (nome === 'list_windows') return { content: [], structuredContent: { windows: [FINESTRA] } };
    if (nome === 'get_window_state') {
      gettoni.add('t1');
      return { content: [{ type: 'image', data: png(1280, 720).toString('base64'), mimeType: 'image/png' }], structuredContent: statoNotepad() };
    }
    if (typeof args?.element_token === 'string' && !gettoni.has(args.element_token)) {
      return { isError: true, content: [{ type: 'text', text: 'element_token is stale or unknown; call get_window_state again to refresh' }] };
    }
    return { content: [], structuredContent: { fatto: nome } };
  };
  let resto = '';
  f.stdin.setEncoding('utf8');
  f.stdin.on('data', (d) => {
    resto += d;
    for (let i = resto.indexOf('\n'); i >= 0; i = resto.indexOf('\n')) {
      const m = JSON.parse(resto.slice(0, i)); resto = resto.slice(i + 1);
      if (m.method === 'initialize') manda({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'finto', version: '0' } } });
      else if (m.method === 'tools/call') {
        const nome = m.params?.name; const args = m.params?.arguments ?? {};
        f.ricevute.push({ nome, args });
        const rispondi = () => manda({ jsonrpc: '2.0', id: m.id, result: risultato(nome, args) });
        if (alRicevere) { alRicevere(nome); setImmediate(rispondi); } else if (tienili.has(nome)) f.inSospeso.set(nome, rispondi); else rispondi();
      }
    }
  });
  f.stdin.on('end', () => { f.chiuso = true; f.exitCode = 0; setImmediate(() => f.emit('exit', 0)); });
  f.kill = () => { if (f.ucciso) return true; f.ucciso = true; f.exitCode = 1; setImmediate(() => f.emit('exit', 1)); return true; };
  f.rilascia = (nome) => { const r = f.inSospeso.get(nome); f.inSospeso.delete(nome); r?.(); };
  return f;
}
