import * as nodeFs from 'node:fs';
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

export class PathPolicyError extends Error {
  constructor(message, code = 'CAMPAIGN_NOT_ALLOWED') {
    super(message);
    this.name = 'PathPolicyError';
    this.code = code;
  }
}

export function isPathInside(rootRealPath, candidateRealPath) {
  const difference = relative(resolve(rootRealPath), resolve(candidateRealPath));
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function assertSafeSegment(value, label) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || value.includes('%')
    || value.includes('/')
    || value.includes('\\')
    || value === '.'
    || value === '..'
    || isAbsolute(value)
    || basename(value) !== value
  ) {
    throw new PathPolicyError(`${label} non ammesso`);
  }
}

function defaultAdapter() {
  return {
    accessSync: nodeFs.accessSync,
    constants: nodeFs.constants,
    existsSync: nodeFs.existsSync,
    readdirSync: nodeFs.readdirSync,
    realpathSync: nodeFs.realpathSync,
    statSync: nodeFs.statSync,
  };
}

export function createPathPolicy({ bancoDir, campaigns, fsAdapter = defaultAdapter() }) {
  if (!isAbsolute(bancoDir)) throw new PathPolicyError('Radice banco non valida', 'CONFIG_INVALID');
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    throw new PathPolicyError('Allowlist campagne non valida', 'CONFIG_INVALID');
  }

  const allowed = Object.freeze([...new Set(campaigns)]);
  for (const campaign of allowed) assertSafeSegment(campaign, 'Campagna');

  let rootRealPath = null;
  let campaignDirectories = null;

  function fsCall(operation, code = 'CAMPAIGN_UNREADABLE') {
    try {
      return operation();
    } catch (error) {
      if (error instanceof PathPolicyError) throw error;
      throw new PathPolicyError('Sorgente campagna non leggibile', code);
    }
  }

  function ensureInitialized() {
    if (!rootRealPath || !campaignDirectories) {
      throw new PathPolicyError('Path policy non inizializzata', 'CONFIG_INVALID');
    }
  }

  function requireCampaign(campaign) {
    assertSafeSegment(campaign, 'Campagna');
    if (!allowed.includes(campaign)) throw new PathPolicyError('Campagna non ammessa');
    ensureInitialized();
    return campaignDirectories.get(campaign);
  }

  function resolveKnownFile(campaign, filename, { mayBeMissing = false } = {}) {
    const campaignDir = requireCampaign(campaign);
    assertSafeSegment(filename, 'File');
    const candidate = join(campaignDir, filename);
    if (!isPathInside(campaignDir, candidate)) throw new PathPolicyError('File fuori campagna');

    const exists = fsAdapter.existsSync ? fsAdapter.existsSync(candidate) : true;
    if (!exists && mayBeMissing) return candidate;

    return fsCall(() => {
      const real = fsAdapter.realpathSync(candidate);
      if (!isPathInside(rootRealPath, real) || !isPathInside(campaignDir, real)) {
        throw new PathPolicyError('File fuori dalla radice consentita');
      }
      if (!fsAdapter.statSync(real).isFile()) {
        throw new PathPolicyError('Sorgente non valida', 'CAMPAIGN_UNREADABLE');
      }
      return real;
    });
  }

  return Object.freeze({
    initialize() {
      rootRealPath = fsCall(() => fsAdapter.realpathSync(bancoDir), 'CONFIG_INVALID');
      fsCall(() => {
        if (!fsAdapter.statSync(rootRealPath).isDirectory()) {
          throw new PathPolicyError('Radice banco non valida', 'CONFIG_INVALID');
        }
        fsAdapter.accessSync(rootRealPath, fsAdapter.constants?.R_OK ?? nodeFs.constants.R_OK);
      }, 'CONFIG_INVALID');

      const next = new Map();
      for (const campaign of allowed) {
        const lexical = join(rootRealPath, campaign);
        const real = fsCall(() => fsAdapter.realpathSync(lexical));
        if (!isPathInside(rootRealPath, real)) {
          throw new PathPolicyError('Campagna fuori dalla radice consentita');
        }
        fsCall(() => {
          if (!fsAdapter.statSync(real).isDirectory()) {
            throw new PathPolicyError('Campagna non leggibile', 'CAMPAIGN_UNREADABLE');
          }
          fsAdapter.accessSync(real, fsAdapter.constants?.R_OK ?? nodeFs.constants.R_OK);
        });
        next.set(campaign, real);
      }
      campaignDirectories = next;
      return this;
    },

    listCampaigns() {
      ensureInitialized();
      return [...allowed];
    },

    resolveCampaignDir(campaign) {
      return requireCampaign(campaign);
    },

    listJsonlFiles(campaign) {
      const campaignDir = requireCampaign(campaign);
      return fsCall(() => fsAdapter.readdirSync(campaignDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .sort((left, right) => left.name.localeCompare(right.name, 'en'))
        .map((entry) => resolveKnownFile(campaign, entry.name)));
    },

    resolveHarnessCostFile(campaign, harness) {
      assertSafeSegment(harness, 'Harness');
      const knownHarnesses = new Set(this.listJsonlFiles(campaign)
        .map((file) => basename(file, '.jsonl')));
      if (!knownHarnesses.has(harness)) throw new PathPolicyError('Harness non ammesso');
      return resolveKnownFile(campaign, `${harness}.costo.json`, { mayBeMissing: true });
    },

    resolveReportFile(campaign) {
      return resolveKnownFile(campaign, 'rapporto.txt', { mayBeMissing: true });
    },
  });
}
