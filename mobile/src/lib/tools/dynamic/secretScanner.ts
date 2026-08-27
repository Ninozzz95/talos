const SECRET_KEY = /(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|cookie|authorization|client[_-]?secret|session[_-]?secret|private[_-]?key)/i
const SECRET_VALUE = [
    /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/,
    /\bAIza[0-9A-Za-z_-]{20,}/,
    /\bgh[opsu]_[A-Za-z0-9]{20,}/,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
]

export interface SecretFinding { path: string; reason: string }

export function scanSecrets(value: unknown, path = '$', findings: SecretFinding[] = []): SecretFinding[] {
    if (typeof value === 'string') {
        if (SECRET_VALUE.some((rx) => rx.test(value))) findings.push({ path, reason: 'secret-like value' })
        return findings
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => scanSecrets(entry, `${path}[${index}]`, findings))
        return findings
    }
    if (!value || typeof value !== 'object') return findings
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const next = `${path}.${key}`
        if (SECRET_KEY.test(key) && entry !== null && entry !== '' && entry !== false) {
            findings.push({ path: next, reason: 'secret-bearing field name' })
        }
        scanSecrets(entry, next, findings)
    }
    return findings
}
