/*
 * talos-relay — QUALE binario di iroh-relay, e con quale impronta (R5.9, owner 18/10/2026).
 *
 * Non compiliamo niente: si scarica il binario UFFICIALE della release iroh v1.3.0 e lo si accetta solo se peso e sha256 sono
 * quelli fissati qui. Le impronte vengono dal campo `digest` dell'API di GitHub
 * (`gh api repos/n0-computer/iroh/releases/tags/v1.3.0`, letto il 18/10/2026); quella di Windows coincide con lo sha256 misurato
 * sul file scaricato il 17/10 (ledger del remoto, §R3). Cambiare versione vuol dire cambiare TUTTA questa tabella, insieme.
 *
 * Su Linux si prende sempre la build musl: è statica, e gira sia sulle distribuzioni glibc sia su Alpine.
 */

export const VERSIONE = 'v1.3.0';
const BASE = `https://github.com/n0-computer/iroh/releases/download/${VERSIONE}`;

export const BINARI = Object.freeze({
  'win32-x64': { file: `iroh-relay-${VERSIONE}-x86_64-pc-windows-msvc.zip`, byte: 3_657_973, sha256: '2064308ca7df288d68eef89c80c194afe5038d85888c87079147dca862195a01' },
  'linux-x64': { file: `iroh-relay-${VERSIONE}-x86_64-unknown-linux-musl.tar.gz`, byte: 3_997_493, sha256: '677f4c62342a6ba8044459b5fd4302f2b1dcb8402542072e3a4ade5039bc0b9e' },
  'linux-arm64': { file: `iroh-relay-${VERSIONE}-aarch64-unknown-linux-musl.tar.gz`, byte: 3_942_127, sha256: 'dc4b9d620642026966d498763ec8ba3a6eefde8d39994b2d63e3d15d7af770f8' },
  'darwin-x64': { file: `iroh-relay-${VERSIONE}-x86_64-apple-darwin.tar.gz`, byte: 3_866_723, sha256: '3423c4b95af50e48991883c6c64776ecbd7cfac9f670b764771429f9addf6755' },
  'darwin-arm64': { file: `iroh-relay-${VERSIONE}-aarch64-apple-darwin.tar.gz`, byte: 3_488_233, sha256: '22d0e0418bfe34858f321eafeb31b0909ebe1d71eb1e31d7ae8928f74330d625' },
});

/** Il binario per questa macchina, o un errore che dice quali ci sono. */
export function binarioPer(platform = process.platform, arch = process.arch) {
  const voce = BINARI[`${platform}-${arch}`];
  if (!voce) {
    throw Object.assign(new Error(`iroh-relay ${VERSIONE} has no official build for ${platform}-${arch}. Supported: ${Object.keys(BINARI).join(', ')}.`), { code: 'RELAY_PLATFORM' });
  }
  return { ...voce, url: `${BASE}/${voce.file}`, eseguibile: platform === 'win32' ? 'iroh-relay.exe' : 'iroh-relay' };
}
