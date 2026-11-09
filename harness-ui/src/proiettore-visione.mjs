/*
 * The vision projector of a local model (`mmproj-*.gguf`), form `FORMA-VISTA-LOCALE-2026-11-01.md` (owner 01/11: «Sempre col modello»).
 * Recognised by its name, with no new field in the store's manifest (Desktop's condition: one function with its test, also for names that
 * are NOT a projector). Same rule as llama.cpp's own downloader (`common/download.cpp:628-661`, sidecar «mmproj» `:667`): a `.gguf` whose
 * path contains «mmproj», in the model's folder, the one whose bits are closest to the model's. On a tie F16 comes first: it is the file
 * every backend reads (Hermes and Jan ship one projector; F32 doubles the weight for nothing declared).
 */

const nomeDi = (percorso) => String(percorso ?? '').split(/[\\/]/u).pop();
const cartellaDi = (percorso) => { const parti = String(percorso ?? '').split(/[\\/]/u); parti.pop(); return parti.join('/'); };

/** true only for a `.gguf` whose file name contains «mmproj» (case does not matter) */
export function eProiettore(percorso) {
  const nome = nomeDi(percorso);
  return /\.gguf$/iu.test(nome) && /mmproj/iu.test(nome);
}

/** The bits of a quantization in a file name: Q4_K_M 4, IQ2_XXS 2, Q8_0 8, F16 and BF16 16, F32 32; unknown 0 (llama.cpp `extract_quant_bits`). */
export function bitsDi(percorso) {
  const nome = nomeDi(percorso).toUpperCase();
  const m = /(?:^|[-_.])(?:I?Q(\d+)|B?F(\d+))(?:[-_.]|$)/u.exec(nome);
  return m ? Number(m[1] ?? m[2]) : 0;
}

/** Among the files of a repository, the projector for `percorsoModello`, or null. */
export function scegliProiettore(files, percorsoModello) {
  const cartella = cartellaDi(percorsoModello);
  const bitsModello = bitsDi(percorsoModello);
  let migliore = null;
  for (const f of Array.isArray(files) ? files : []) {
    const percorso = typeof f === 'string' ? f : f?.path;
    if (!eProiettore(percorso) || cartellaDi(percorso) !== cartella) continue;
    const distanza = Math.abs(bitsDi(percorso) - bitsModello);
    const f16 = /(?:^|[-_.])F16(?:[-_.]|$)/iu.test(nomeDi(percorso)); // «BF16» does not match: the B sits between the separator and F16
    if (!migliore || distanza < migliore.distanza || (distanza === migliore.distanza && f16 && !migliore.f16)) migliore = { file: f, distanza, f16 };
  }
  return migliore?.file ?? null;
}

/**
 * Ollama and LM Studio already say whether a model sees (`capabilities.vision`, observed: the same the providers card shows); until
 * 01/11 TALOS answered null for them. `true`/`false` only when observed, otherwise null («not offered»), never a guess.
 */
export async function vedeDaRuntimeCompatibile(modelId, runtimes) {
  const via = /^(ollama|lmstudio):/u.exec(String(modelId ?? ''))?.[1];
  if (!via) return null;
  let modelli = null;
  try { modelli = await runtimes?.[via]?.listModels?.(); } catch { modelli = null; }
  const modello = Array.isArray(modelli) ? modelli.find((m) => m?.id === String(modelId).slice(via.length + 1)) : null;
  return modello?.capabilities?.vision?.state === 'observed' ? modello.capabilities.vision.value === true : null;
}

/**
 * The download of a model takes its projector along, like Hermes («downloads with model», `catalog.py:104`) and Jan (owner 01/11: «Sempre
 * col modello»). Done on the server, so every page and every device gets it from one rule. `elencaFile(repo, revision)` gives the
 * repository's `.gguf` files as `{ path, sizeBytes, sha256 }` (`hf-hub-client.mjs:109`). Without a projector, without its fingerprint,
 * or with the list unreadable, the body goes as it came: the model downloads, it just does not see.
 */
export async function conIlProiettore(corpo, elencaFile) {
  const files = Array.isArray(corpo?.files) ? corpo.files : [];
  if (!files.length || files.some((f) => eProiettore(f?.path)) || typeof elencaFile !== 'function') return { corpo, proiettore: null };
  let elenco = null;
  try { elenco = await elencaFile(corpo.repo, corpo.revision); } catch { elenco = null; }
  const scelto = scegliProiettore(elenco, files[0].path);
  if (!scelto || !Number.isSafeInteger(scelto.sizeBytes) || scelto.sizeBytes <= 0 || !/^[a-f0-9]{64}$/iu.test(String(scelto.sha256 ?? ''))) return { corpo, proiettore: null };
  const proiettore = { path: scelto.path, bytes: scelto.sizeBytes, sha256: scelto.sha256 };
  return { corpo: { ...corpo, files: [...files, proiettore], bytes: corpo.bytes + scelto.sizeBytes }, proiettore };
}

/**
 * 02/11/2026, form «proiettore nel conto» (OK of CLI, Mobile, Performance, Desktop): the memory the projector takes when the engine
 * opens with it, in MiB. The value MEASURED by the engine when the caller knows it (`memoriaMiB`, Performance's condition: from the line
 * «[mtmd] estimated worst-case memory usage of mmproj»), otherwise the estimate of 2x the file (ONE measurement: 758.44 MiB for 379 MB,
 * LFM3-VL-2B, 01/11/2026 — not verified on a second projector). One function for the engine's choices and for the «fits» verdict.
 */
export function memoriaDelProiettoreMiB(proiettore) {
  if (Number.isFinite(proiettore?.memoriaMiB) && proiettore.memoriaMiB > 0) return Math.ceil(proiettore.memoriaMiB);
  return Number.isSafeInteger(proiettore?.bytes) && proiettore.bytes > 0 ? Math.ceil((2 * proiettore.bytes) / (1024 * 1024)) : 0;
}

/** The projector a downloaded model carries: never `files[0]`, which is the model itself. */
export function proiettoreDelManifesto(manifesto) {
  const files = Array.isArray(manifesto?.files) ? manifesto.files : [];
  return files.slice(1).find((f) => eProiettore(f?.path)) ?? null;
}

/**
 * 01/11/2026, vista locale (forma, punto 5; Performance: «la via principale è fermarsi prima della rete»; Mobile, condizione 2): what the
 * OPEN local engine says about images (`/props` → `modalities.vision`, read by the supervisor at start), as a catalog entry for the model
 * that is open. `{ inputModalities }` only for `local:<the open model>` on a ready engine that said true or false; null otherwise (unknown
 * stays unknown, never "no"). With `['text']` the adapter refuses an image sent now (MODEL_IMAGE_NOT_SUPPORTED) before the request leaves,
 * and older images become the line in their place.
 */
export function capacitaDelLocaleAperto(modelId, stato) {
  const id = typeof modelId === 'string' && modelId.startsWith('local:') ? modelId.slice('local:'.length) : null;
  if (!id || stato?.state !== 'ready' || stato.modelId !== id || typeof stato.vede !== 'boolean') return null;
  return { inputModalities: stato.vede ? ['text', 'image'] : ['text'] };
}
