// Forma delle risposte GET /sessions e /:id/metrics, osservata 05/09/2026.
// Valori controllati del mockup: non sono misure delle 73 sessioni dello store.
import { SESSIONI } from './sessioni.js';
export const ADESSO_BOARD = new Date('2026-09-04T18:11:00');
const TOTALI=[41200,22400,12800,98100,31700,8900];
const DATE=['2026-09-04T18:09:00','2026-09-04T17:53:00','2026-09-04T17:11:00','2026-09-03T09:00:00','2026-09-02T15:00:00','2026-09-01T10:00:00'];
export const SESSIONI_BOARD=SESSIONI.map((s,i)=>({...s,avviataAlle:DATE[i],usage:{giri:s.usage.giri,prompt_tokens:TOTALI[i]-1000,completion_tokens:1000,cached_tokens:Math.round((TOTALI[i]-1000)*[.87,.84,.91,.62,.88,.79][i])}}));
export const METRICHE_BOARD=Object.fromEntries(SESSIONI_BOARD.map((s,i)=>[s.sessionId,{registrato:true,motivo:null,giri:1,cache:{percentuale:[87,84,91,62,88,79][i],promptTokens:s.usage.prompt_tokens,cachedTokens:s.usage.cached_tokens,denominatore:'prompt_tokens',motivoAssente:null},primoToken:{ms:[1400,1100,900,3100,1200,1000][i],motivoAssente:null},chiusura:{motivo:[null,null,'fine-lavoro','giri-finiti','fine-lavoro','fermata'][i],codice:null,motivoAssente:null}}]));
export const CARTELLE_BOARD=Object.fromEntries(SESSIONI_BOARD.map((s,i)=>[s.sessionId,i<4?'C:/AVM-harness-desktop':'C:/AVM']));
