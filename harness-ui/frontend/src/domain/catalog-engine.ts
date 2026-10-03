/**
 * Motore del catalogo a faccette — port di `prototypes/calm-lab/src/catalog-engine.mjs`.
 *
 * ⛔ PURO: nessun DOM, nessuna rete, nessuna inferenza. Entrano record, escono liste,
 * conteggi e chip. È la ragione per cui è portabile: il prototipo lo teneva già separato
 * dalla sua interfaccia, quindi la logica si porta **verbatim** e cambia solo il tipo.
 * Non portate (servono a rotte e viste salvate, che nel prodotto non esistono):
 * `compactCatalogFilters`, `validateSavedViews`.
 *
 * ⭐ Le tre regole della ricerca a faccette che il codice qui sotto implementa
 * (18/09/2026 — multigrid.ai/learn/faceted-search; meilisearch.com «build faceted
 * navigation»; nosto.com «setting up facets»):
 *   1. **OR dentro una faccetta, AND fra faccette** — e per questo `facetCount` toglie
 *      il filtro della faccetta che sta contando, altrimenti spuntando un valore gli
 *      altri andrebbero a zero da soli;
 *   2. i valori a **conteggio zero restano visibili e non cliccabili** — «Facets with a
 *      count of zero should not be selectable by a visitor in the interface» (Voyado
 *      Elevate, docs.elevate.voyado.cloud/elevate/3/guides/working-with/facets, 18/09/2026),
 *      e si tengono in posizione stabile (`Include zeros` + `Keep order`) perché non
 *      saltino sotto il dito;
 *   3. i **conteggi accanto ai valori**, e le faccette lunghe limitate con «vedi altri».
 *
 * ⛔ **«Non noto» non è zero**: un prezzo mancante non è un modello gratuito e un
 * parametro mancante non è un modello da 0 B. È una decisione che le piattaforme serie
 * rendono **esplicita** invece di implicita — AWS QuickSight pretende un `NullOption`
 * (`ALL_VALUES | NULLS_ONLY | NON_NULLS_ONLY`) su ogni filtro numerico
 * (docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-quicksight-analysis-numericrangefilter.html,
 * 18/09/2026), e Algolia non lascia filtrare affatto sugli attributi assenti
 * (support.algolia.com, «Do I need to replicate every piece of data across each record»,
 * 18/09/2026). Qui l'equivalente è `includeUnknown`: spento, i record senza il dato sono
 * **esclusi** dal filtro numerico; acceso, sono **inclusi**. Mai trattati come zero.
 *
 * ⛔ TypeScript **erasabile** (nessun `enum`, nessun `namespace` a runtime, nessuna
 * proprietà-parametro): il file gira direttamente sotto `node --test` per type stripping
 * (nodejs.org/api/typescript.html, «Type stripping», Node 24 — verificato il 18/09/2026
 * su v24.18.0: un `.test.mjs` importa un `.ts` senza flag). Gli import, dove servono,
 * portano l'estensione esplicita.
 */

import { t } from '../components/lingua.js';
export type Destination = 'local' | 'cloud';
export type FilterBasis = 'total' | 'active';
export type FacetKey = string;

/** Valore di un filtro: stringa (soglia o sort), lista (faccetta), booleano (interruttore). */
export type FilterValue = string | string[] | boolean | number;

/** Gli id di `CATALOG_SORTS`. Un sort fuori da qui non sopravvive a `validateCatalogFilters`. */
export type CatalogSortId =
  | 'catalog'
  | 'params-asc'
  | 'params-desc'
  | 'file-asc'
  | 'ram-asc'
  | 'context-desc'
  | 'updated-desc'
  | 'name'
  | 'price-asc';

/**
 * Una fascia di parametri. `min` è **escluso**, `max` è **incluso** (vedi il test dei confini).
 * La fascia `unknown` è l'unica senza confini: li ha opzionali perché il codice non li legge
 * mai — `id === 'unknown'` esce prima — e inventarle un intervallo sarebbe una bugia.
 */
export interface SizeBand {
  id: string;
  label: string;
  min?: number;
  max?: number;
}

/** Un artefatto scaricabile di un modello locale: formato, quantizzazione, peso, memoria. */
export interface CatalogArtifact {
  [key: string]: unknown;
  id?: string;
  file?: string | null | undefined;
  format?: string | null | undefined;
  quantization?: string | null | undefined;
  size?: number | null | undefined;
  required?: number | null | undefined;
}

/**
 * Record canonico del motore. I campi che il prodotto non conosce valgono `null` o `''`,
 * **mai** un valore plausibile: è la differenza che il catalogo deve mostrare.
 */
export interface CatalogModel {
  [key: string]: unknown;
  id: string;
  name: string;
  /** Sempre stringa (una famiglia non nota è `''`): la ricerca la concatena senza guardie. */
  family?: string | null;
  author?: string | null;
  provider?: string | null;
  repo?: string | null;
  file?: string | null;
  destination: Destination;
  context?: number | null;
  parametersB?: number | null;
  activeParametersB?: number | null;
  architecture?: string | null;
  capabilities?: string[] | null;
  languages?: string[] | null;
  license?: string | null;
  access?: string | null;
  installed?: boolean;
  updatedAt?: string | null;
  priceInput?: number | null;
  priceOutput?: number | null;
  format?: string | null;
  quantization?: string | null;
  size?: number | null;
  required?: number | null;
  tasks?: string[] | null;
  artifacts?: CatalogArtifact[];
}

/** Contesto esterno: preferiti, download in corso. Il motore non li possiede, li riceve. */
export interface CatalogContext {
  query?: string;
  favorites?: readonly string[];
  downloads?: readonly { modelId: string; status: string }[];
}

export interface CatalogFilters {
  [key: string]: FilterValue;
  destination: string[];
  status: string[];
  favorite: boolean;
  sizes: string[];
  minParams: string;
  maxParams: string;
  basis: FilterBasis;
  minContext: string;
  maxFile: string;
  maxRam: string;
  fit: string[];
  tasks: string[];
  capabilities: string[];
  formats: string[];
  quant: string[];
  authors: string[];
  providers: string[];
  licenses: string[];
  languages: string[];
  access: string[];
  arch: string[];
  maxInput: string;
  maxOutput: string;
  includeUnknown: boolean;
  sort: CatalogSortId;
}

export interface ActiveChip {
  key: string;
  value: FilterValue | undefined;
  label: string;
}

/*
 * ⛔ 03/10/2026, corsia S2 della lingua: le etichette di queste tabelle sono getter sul dizionario (`modelli.catalog.*`),
 *   lette nella lingua corrente. Il valore (`[0]`) resta un dato; l'etichetta (`[1]`, `label`) segue la lingua.
 */
function voce(valore: string, chiave: string): readonly [string, string] {
  return Object.defineProperty([valore], 1, { enumerable: true, get: () => t(chiave) }) as unknown as readonly [string, string];
}

export const SIZE_BANDS: readonly SizeBand[] = Object.freeze([
  { id: 'tiny', get label() { return t('modelli.catalog.size.tiny'); }, min: 0, max: 3 },
  { id: 'small', get label() { return t('modelli.catalog.size.small'); }, min: 3, max: 8 },
  { id: 'medium', get label() { return t('modelli.catalog.size.medium'); }, min: 8, max: 14 },
  { id: 'large', get label() { return t('modelli.catalog.size.large'); }, min: 14, max: 35 },
  { id: 'xl', get label() { return t('modelli.catalog.size.xl'); }, min: 35, max: 70 },
  { id: 'xxl', get label() { return t('modelli.catalog.size.xxl'); }, min: 70, max: Infinity },
  { id: 'unknown', get label() { return t('modelli.catalog.size.unknown'); } },
]);

export const FACET_OPTIONS: Readonly<Record<string, readonly (readonly [string, string])[]>> = Object.freeze({
  destination: [voce('local', 'modelli.catalog.destination.local'), voce('cloud', 'modelli.catalog.destination.cloud')] as const,
  status: [voce('installed', 'modelli.catalog.status.installed'), voce('not-installed', 'modelli.catalog.status.not_installed'), voce('downloading', 'modelli.catalog.status.downloading')] as const,
  fit: [voce('fits', 'modelli.catalog.fit.fits'), voce('exceeds', 'modelli.catalog.fit.exceeds'), voce('unknown', 'modelli.catalog.fit.unknown')] as const,
  tasks: [voce('general', 'modelli.catalog.tasks.general'), voce('code', 'modelli.catalog.tasks.code'), voce('write', 'modelli.catalog.tasks.write'), voce('embedding', 'modelli.catalog.tasks.embedding')] as const,
  capabilities: [
    voce('tools', 'modelli.catalog.capabilities.tools'),
    voce('vision', 'modelli.catalog.capabilities.vision'),
    voce('reasoning', 'modelli.catalog.capabilities.reasoning'),
    voce('json', 'modelli.catalog.capabilities.json'),
    voce('audio', 'modelli.catalog.capabilities.audio'),
  ] as const,
  formats: [voce('GGUF', 'modelli.catalog.formats.GGUF'), voce('safetensors', 'modelli.catalog.formats.safetensors'), voce('unknown', 'modelli.catalog.formats.unknown')] as const,
  quant: [voce('Q4_K_M', 'modelli.catalog.quant.Q4_K_M'), voce('Q5_K_M', 'modelli.catalog.quant.Q5_K_M'), voce('Q8_0', 'modelli.catalog.quant.Q8_0'), voce('F16', 'modelli.catalog.quant.F16'), voce('unknown', 'modelli.catalog.quant.unknown')] as const,
  languages: [voce('it', 'modelli.catalog.languages.it'), voce('en', 'modelli.catalog.languages.en'), voce('multi', 'modelli.catalog.languages.multi'), voce('unknown', 'modelli.catalog.languages.unknown')] as const,
  access: [
    voce('open', 'modelli.catalog.access.open'),
    voce('approval', 'modelli.catalog.access.approval'),
    voce('account', 'modelli.catalog.access.account'),
    voce('unknown', 'modelli.catalog.access.unknown'),
  ] as const,
  arch: [voce('dense', 'modelli.catalog.arch.dense'), voce('moe', 'modelli.catalog.arch.moe'), voce('unknown', 'modelli.catalog.arch.unknown')] as const,
});

export const CATALOG_SORTS: readonly (readonly [string, string])[] = Object.freeze([
  voce('catalog', 'modelli.catalog.sort.catalog'),
  voce('params-asc', 'modelli.catalog.sort.params_asc'),
  voce('params-desc', 'modelli.catalog.sort.params_desc'),
  voce('file-asc', 'modelli.catalog.sort.file_asc'),
  voce('ram-asc', 'modelli.catalog.sort.ram_asc'),
  voce('context-desc', 'modelli.catalog.sort.context_desc'),
  voce('updated-desc', 'modelli.catalog.sort.updated_desc'),
  voce('name', 'modelli.catalog.sort.name'),
  voce('price-asc', 'modelli.catalog.sort.price_asc'),
]);

export function emptyCatalogFilters(): CatalogFilters {
  return {
    destination: [],
    status: [],
    favorite: false,
    sizes: [],
    minParams: '',
    maxParams: '',
    basis: 'total',
    minContext: '',
    maxFile: '',
    maxRam: '',
    fit: [],
    tasks: [],
    capabilities: [],
    formats: [],
    quant: [],
    authors: [],
    providers: [],
    licenses: [],
    languages: [],
    access: [],
    arch: [],
    maxInput: '',
    maxOutput: '',
    includeUnknown: false,
    sort: 'catalog',
  };
}

const CF_ARRAYS = [
  'destination',
  'status',
  'sizes',
  'fit',
  'tasks',
  'capabilities',
  'formats',
  'quant',
  'authors',
  'providers',
  'licenses',
  'languages',
  'access',
  'arch',
];
const CF_NUMBERS = ['minParams', 'maxParams', 'minContext', 'maxFile', 'maxRam', 'maxInput', 'maxOutput'];

const cfNormalize = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('it')
    .trim();

/** Predicato **e** guardia di tipo: «il dato c'è ed è un numero utilizzabile». */
const cfKnown = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

export function validateCatalogFilters(raw: unknown): CatalogFilters {
  const f = emptyCatalogFilters();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return f;
  const src = raw as Record<string, unknown>;
  for (const key of CF_ARRAYS) {
    if (!Array.isArray(src[key])) continue;
    const allowed = key === 'sizes' ? SIZE_BANDS.map((x) => x.id) : FACET_OPTIONS[key]?.map((x) => x[0]);
    f[key] = [
      ...new Set(
        (src[key] as unknown[]).filter(
          (x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 100 && (!allowed || allowed.includes(x)),
        ),
      ),
    ].slice(0, 24);
  }
  for (const key of CF_NUMBERS) {
    if (src[key] !== '' && src[key] !== null && src[key] !== undefined) {
      const n = Number(src[key]);
      if (Number.isFinite(n) && n >= 0 && n <= 1e9) f[key] = String(n);
    }
  }
  f.basis = src.basis === 'active' ? 'active' : 'total';
  f.favorite = src.favorite === true;
  f.includeUnknown = src.includeUnknown === true;
  f.sort = CATALOG_SORTS.some(([v]) => v === src.sort) ? (src.sort as CatalogSortId) : 'catalog';
  return f;
}

export function catalogInputErrors(raw: unknown): string[] {
  const f = validateCatalogFilters(raw);
  const errors: string[] = [];
  if (f.minParams !== '' && f.maxParams !== '' && Number(f.minParams) > Number(f.maxParams)) {
    errors.push(t('modelli.catalog.error.minAboveMax'));
  }
  return errors;
}

export function parameterValue(m: CatalogModel, basis: FilterBasis = 'total'): number | null {
  if (basis === 'active') {
    if (m.architecture === 'moe') return cfKnown(m.activeParametersB) ? m.activeParametersB : null;
    if (m.architecture !== 'dense') return null;
  }
  return cfKnown(m.parametersB) ? m.parametersB : null;
}

function cfRange(value: unknown, min: FilterValue, max: FilterValue, unknown: boolean): boolean {
  if (!cfKnown(value)) return unknown;
  return (min === '' || value >= Number(min)) && (max === '' || value <= Number(max));
}

function cfValues(value: unknown): readonly unknown[] {
  if (value === null || value === undefined || value === '') return ['unknown'];
  return Array.isArray(value) ? (value.length ? value : ['none']) : [value];
}

function cfAny(selected: readonly string[], value: unknown): boolean {
  return !selected.length || selected.some((x) => cfValues(value).includes(x));
}

export function catalogArtifacts(m: CatalogModel): CatalogArtifact[] {
  if (Array.isArray(m.artifacts)) return m.artifacts;
  return m.destination === 'local'
    ? [
        {
          id: m.id + ':profile',
          file: m.file,
          format: m.format,
          quantization: m.quantization,
          size: m.size,
          required: m.required,
        },
      ]
    : [];
}

export function matchingArtifacts(m: CatalogModel, raw: unknown): CatalogArtifact[] {
  const f = validateCatalogFilters(raw);
  return catalogArtifacts(m).filter(
    (a) =>
      cfAny(f.formats, a.format) &&
      cfAny(f.quant, a.quantization) &&
      (f.maxFile === '' || cfRange(a.size, '', f.maxFile, f.includeUnknown)) &&
      (f.maxRam === '' || cfRange(a.required, '', f.maxRam, f.includeUnknown)) &&
      (!f.fit.length || f.fit.includes(cfKnown(a.required) ? (a.required <= 18.6 ? 'fits' : 'exceeds') : 'unknown')),
  );
}

export function modelMatchesCatalog(m: CatalogModel, raw: unknown, { query = '', favorites = [], downloads = [] }: CatalogContext = {}): boolean {
  const f = validateCatalogFilters(raw);
  if (catalogInputErrors(f).length) return false;
  const terms = cfNormalize(query).split(/\s+/).filter(Boolean);
  if (!terms.every((t) => cfNormalize(`${m.name} ${m.family} ${m.author || ''} ${m.provider} ${m.repo || ''} ${m.file || ''}`).includes(t))) return false;
  if (
    !cfAny(f.destination, m.destination) ||
    !cfAny(f.tasks, m.tasks) ||
    !cfAny(f.authors, m.author) ||
    !cfAny(f.providers, m.provider) ||
    !cfAny(f.licenses, m.license) ||
    !cfAny(f.languages, m.languages) ||
    !cfAny(f.access, m.access) ||
    !cfAny(f.arch, m.architecture)
  )
    return false;
  if (f.favorite && !favorites.includes(m.id)) return false;
  if (
    f.status.length &&
    !f.status.some((x) =>
      x === 'installed' ? m.installed : x === 'not-installed' ? m.destination === 'local' && !m.installed : x === 'downloading' && downloads.some((j) => j.modelId === m.id && ['running', 'paused', 'error'].includes(j.status)),
    )
  )
    return false;
  if (f.capabilities.length && !f.capabilities.every((x) => Array.isArray(m.capabilities) && m.capabilities.includes(x))) return false;
  const p = parameterValue(m, f.basis);
  if (
    f.sizes.length &&
    !f.sizes.some((id) => {
      // `validateCatalogFilters` ha già scartato gli id fuori da `SIZE_BANDS`: qui c'è sempre.
      const b = SIZE_BANDS.find((x) => x.id === id)!;
      // I due ripieghi servono al tipo, non al verdetto: l'unica fascia senza confini è
      // `unknown`, e per essa la riga qui sotto esce da `id === 'unknown'`.
      const lo = b.min ?? 0;
      const hi = b.max ?? Infinity;
      return id === 'unknown' ? p === null : p !== null && (p > lo || (lo === 0 && p === 0)) && p <= hi;
    })
  ) {
    if (!(p === null && f.includeUnknown)) return false;
  }
  if ((f.minParams !== '' || f.maxParams !== '') && !cfRange(p, f.minParams, f.maxParams, f.includeUnknown)) return false;
  if (f.minContext !== '' && !cfRange(m.context, f.minContext, '', f.includeUnknown)) return false;
  const artifactFilter = f.formats.length || f.quant.length || f.maxFile !== '' || f.maxRam !== '' || f.fit.length;
  // Il cloud non viene presentato come compatibile con la RAM locale, neppure includendo dati ignoti.
  if (artifactFilter && (m.destination !== 'local' || !matchingArtifacts(m, f).length)) return false;
  const priceFilter = f.maxInput !== '' || f.maxOutput !== '';
  if (
    priceFilter &&
    (m.destination !== 'cloud' ||
      (f.maxInput !== '' && !cfRange(m.priceInput, '', f.maxInput, f.includeUnknown)) ||
      (f.maxOutput !== '' && !cfRange(m.priceOutput, '', f.maxOutput, f.includeUnknown)))
  )
    return false;
  return true;
}

export function selectCatalog(models: readonly CatalogModel[], raw: unknown, context: CatalogContext = {}): CatalogModel[] {
  const f = validateCatalogFilters(raw);
  const list = models.filter((m) => modelMatchesCatalog(m, f, context));
  const firstNumber = (m: CatalogModel, key: string): number | null => {
    const values = matchingArtifacts(m, f)
      .map((a) => a[key])
      .filter(cfKnown);
    return values.length ? Math.min(...values) : null;
  };
  const sorts: Partial<Record<CatalogSortId, readonly [(m: CatalogModel) => number | null, number]>> = {
    'params-asc': [(m) => parameterValue(m, f.basis), 1],
    'params-desc': [(m) => parameterValue(m, f.basis), -1],
    'file-asc': [(m) => firstNumber(m, 'size'), 1],
    'ram-asc': [(m) => firstNumber(m, 'required'), 1],
    'context-desc': [(m) => (cfKnown(m.context) ? m.context : null), -1],
    'updated-desc': [(m) => (m.updatedAt ? Date.parse(m.updatedAt) : null), -1],
    'price-asc': [(m) => (m.destination === 'cloud' && cfKnown(m.priceInput) ? m.priceInput : null), 1],
  };
  if (f.sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const sort = sorts[f.sort];
  if (sort) {
    const [get, dir] = sort;
    return list.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Gli sconosciuti non sono «zero»: finiscono in fondo in **entrambe** le direzioni.
      if (av === null || !Number.isFinite(av)) return bv === null || !Number.isFinite(bv) ? 0 : 1;
      if (bv === null || !Number.isFinite(bv)) return -1;
      return dir * (av - bv);
    });
  }
  return list;
}

export function facetCount(models: readonly CatalogModel[], raw: unknown, key: FacetKey, value: string, context: CatalogContext = {}): number {
  const f = validateCatalogFilters(raw);
  if (key === 'sizes') {
    f.minParams = '';
    f.maxParams = '';
  }
  if (key === 'favorite') f.favorite = true;
  else if (key === 'capabilities') f.capabilities = [...new Set([...f.capabilities, value])];
  else f[key] = Array.isArray(f[key]) ? [value] : value;
  return selectCatalog(models, f, context).length;
}

export function toggleCatalogFacet(raw: unknown, key: FacetKey, value: string): CatalogFilters {
  const f = validateCatalogFilters(raw);
  const current = f[key];
  if (Array.isArray(current)) f[key] = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
  else if (typeof current === 'boolean') f[key] = !current;
  return validateCatalogFilters(f);
}

const CF_NAMES: Readonly<Record<string, string>> = {
  get destination() { return t('modelli.catalog.name.destination'); },
  get status() { return t('modelli.catalog.name.status'); },
  get favorite() { return t('modelli.catalog.name.favorite'); },
  get sizes() { return t('modelli.catalog.name.sizes'); },
  get minParams() { return t('modelli.catalog.name.minParams'); },
  get maxParams() { return t('modelli.catalog.name.maxParams'); },
  get minContext() { return t('modelli.catalog.name.minContext'); },
  get maxFile() { return t('modelli.catalog.name.maxFile'); },
  get maxRam() { return t('modelli.catalog.name.maxRam'); },
  get fit() { return t('modelli.catalog.name.fit'); },
  get tasks() { return t('modelli.catalog.name.tasks'); },
  get capabilities() { return t('modelli.catalog.name.capabilities'); },
  get formats() { return t('modelli.catalog.name.formats'); },
  get quant() { return t('modelli.catalog.name.quant'); },
  get authors() { return t('modelli.catalog.name.authors'); },
  get providers() { return t('modelli.catalog.name.providers'); },
  get licenses() { return t('modelli.catalog.name.licenses'); },
  get languages() { return t('modelli.catalog.name.languages'); },
  get access() { return t('modelli.catalog.name.access'); },
  get arch() { return t('modelli.catalog.name.arch'); },
  get maxInput() { return t('modelli.catalog.name.maxInput'); },
  get maxOutput() { return t('modelli.catalog.name.maxOutput'); },
};

/** I chip dei filtri attivi. Un filtro al valore predefinito non produce un chip fantasma. */
export function activeCatalogFilters(raw: unknown): ActiveChip[] {
  const f = validateCatalogFilters(raw);
  const chips: ActiveChip[] = [];
  for (const [key, name] of Object.entries(CF_NAMES)) {
    const v = f[key];
    if (Array.isArray(v)) {
      for (const value of v) {
        const label = key === 'sizes' ? SIZE_BANDS.find((x) => x.id === value)?.label : FACET_OPTIONS[key]?.find((x) => x[0] === value)?.[1];
        chips.push({ key, value, label: `${name}: ${label || value}` });
      }
    } else if (v === true) chips.push({ key, value: true, label: t('modelli.catalog.chip.favoritesOnly') });
    else if (typeof v !== 'boolean' && v !== '') {
      const unit = key.includes('Params') ? 'B' : ['maxRam', 'maxFile'].includes(key) ? ' GiB' : key === 'minContext' ? ' token' : ' $/M';
      chips.push({ key, value: v, label: `${name}: ${v}${unit}` });
    }
  }
  if (f.includeUnknown) chips.push({ key: 'includeUnknown', value: true, label: t('modelli.catalog.chip.includeUnknown') });
  if (f.basis === 'active') chips.push({ key: 'basis', value: 'active', label: t('modelli.catalog.chip.activeParameters') });
  return chips;
}

export function removeCatalogFilter(raw: unknown, key: FacetKey, value?: string | boolean): CatalogFilters {
  const f = validateCatalogFilters(raw);
  if (key === 'basis') f.basis = 'total';
  else if (Array.isArray(f[key])) f[key] = (f[key] as string[]).filter((x) => x !== value);
  else if (typeof f[key] === 'boolean') f[key] = false;
  else if (key in CF_NAMES) f[key] = '';
  return f;
}
