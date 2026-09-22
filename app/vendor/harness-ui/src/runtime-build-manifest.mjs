const MANIFEST_KEYS = ['runtimeId', 'version', 'commit', 'platform', 'sha256', 'source'];
const HEX40 = /^[a-f0-9]{40}$/i;
const HEX64 = /^[a-f0-9]{64}$/i;

function invalid(message) {
  const error = new Error(message);
  error.code = 'LOCAL_RUNTIME_INVALID';
  return error;
}

function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseRuntimeBuildManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value, MANIFEST_KEYS)) {
    throw invalid('runtime build manifest shape is invalid');
  }
  for (const key of ['runtimeId', 'version', 'platform']) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') throw invalid(`${key} is required`);
  }
  if (typeof value.commit !== 'string' || !HEX40.test(value.commit)) throw invalid('commit must be a full hexadecimal revision');
  if (typeof value.sha256 !== 'string' || !HEX64.test(value.sha256)) throw invalid('sha256 must be a hexadecimal digest');
  if (typeof value.source !== 'string' || !/^https:\/\//i.test(value.source)) throw invalid('source must be an HTTPS URL');
  return { ...value };
}
