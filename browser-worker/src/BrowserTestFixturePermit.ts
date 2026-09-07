import { BrowserError } from './BrowserErrors.js'

const FIXTURE_ORIGIN_VARIABLE = 'TALOS_BROWSER_TEST_FIXTURE_ORIGIN'
const EXACT_LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/
const MIN_FIXTURE_PORT = 1_024
const MAX_PORT = 65_535

export class BrowserTestFixturePermit {
  readonly enabled: boolean
  readonly #hostname?: string
  readonly #port?: number

  private constructor(enabled: boolean, hostname?: string, port?: number) {
    this.enabled = enabled
    this.#hostname = hostname
    this.#port = port
    Object.freeze(this)
  }

  static disabled(): BrowserTestFixturePermit {
    return new BrowserTestFixturePermit(false)
  }

  static fromEnvironment(
    environment: Readonly<Record<string, string | undefined>>,
    runtimeEnvironment: string | undefined,
  ): BrowserTestFixturePermit {
    if (runtimeEnvironment !== 'test') return BrowserTestFixturePermit.disabled()
    if (!Object.hasOwn(environment, FIXTURE_ORIGIN_VARIABLE) || environment[FIXTURE_ORIGIN_VARIABLE] === undefined) {
      return BrowserTestFixturePermit.disabled()
    }

    const origin = environment[FIXTURE_ORIGIN_VARIABLE]
    const match = typeof origin === 'string' ? EXACT_LOOPBACK_ORIGIN.exec(origin) : null
    const port = match === null ? Number.NaN : Number(match[1])
    if (match === null || !Number.isInteger(port) || port < MIN_FIXTURE_PORT || port > MAX_PORT) {
      throw invalidFixtureOrigin()
    }

    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.port !== String(port)
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
      || parsed.username !== ''
      || parsed.password !== '') {
      throw invalidFixtureOrigin()
    }

    return new BrowserTestFixturePermit(true, parsed.hostname, port)
  }

  allows(hostname: string, port: number): boolean {
    return this.enabled && hostname === this.#hostname && port === this.#port
  }

  allowsUrl(value: string): boolean {
    if (!this.enabled || this.#hostname === undefined || this.#port === undefined) return false
    const origin = `http://${this.#hostname}:${this.#port}`
    if (!value.startsWith(origin)) return false
    const delimiter = value.at(origin.length)
    if (delimiter !== undefined && delimiter !== '/' && delimiter !== '?' && delimiter !== '#') return false

    try {
      const url = new URL(value)
      return url.protocol === 'http:'
        && url.hostname === this.#hostname
        && url.port === String(this.#port)
        && url.username === ''
        && url.password === ''
    } catch {
      return false
    }
  }
}

function invalidFixtureOrigin(): BrowserError {
  return new BrowserError(
    'Browser test fixture origin must be an exact HTTP 127.0.0.1 origin with an explicit non-privileged port.',
    'TALOS_BROWSER_TEST_FIXTURE_ORIGIN_INVALID',
    500,
  )
}
