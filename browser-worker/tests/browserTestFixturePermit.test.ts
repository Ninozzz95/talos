import { createServer, type RequestListener, type Server } from 'node:http'
import { connect } from 'node:net'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserEgressProxy } from '../src/BrowserEgressProxy.js'
import { BrowserSessionManager } from '../src/BrowserSessionManager.js'
import { BrowserTestFixturePermit } from '../src/BrowserTestFixturePermit.js'
import { assertAllowedBrowserUrl } from '../src/BrowserUrlPolicy.js'
import { buildServer } from '../src/server.js'

const LOOPBACK = '127.0.0.1'
const openManagers = new Set<BrowserSessionManager>()
const openServers = new Set<Server>()

afterEach(async () => {
  await Promise.allSettled([...openManagers].map((manager) => manager.close()))
  openManagers.clear()
  await Promise.allSettled([...openServers].map((server) => closeServer(server)))
  openServers.clear()
})

describe('BrowserTestFixturePermit', () => {
  it('HJ-PERMIT-001 keeps an absent test fixture permit disabled', async () => {
    const absent = BrowserTestFixturePermit.fromEnvironment({}, 'test')

    expect(absent.enabled).toBe(false)
    await expect(assertAllowedBrowserUrl('http://127.0.0.1:43125/', absent)).rejects.toMatchObject({
      code: 'TALOS_BROWSER_INVALID_NAVIGATION_URL',
    })
  })

  it('HJ-PERMIT-003 ignores fixture configuration outside the exact test runtime', async () => {
    const production = BrowserTestFixturePermit.fromEnvironment({
      TALOS_BROWSER_TEST_FIXTURE_ORIGIN: 'http://127.0.0.1:43125',
    }, 'production')
    const development = BrowserTestFixturePermit.fromEnvironment({
      TALOS_BROWSER_TEST_FIXTURE_ORIGIN: 'not even a URL',
    }, 'development')

    expect(production.enabled).toBe(false)
    expect(development.enabled).toBe(false)
    await expect(assertAllowedBrowserUrl('http://127.0.0.1:43125/', production)).rejects.toMatchObject({
      code: 'TALOS_BROWSER_INVALID_NAVIGATION_URL',
    })
  })

  it('HJ-PERMIT-002 allows only the exact configured host and port', async () => {
    const permit = enabledPermit(43125)

    expect(permit.enabled).toBe(true)
    expect(permit.allows('127.0.0.1', 43125)).toBe(true)
    expect(permit.allows('127.0.0.1', 43126)).toBe(false)
    expect(permit.allows('127.0.0.1.', 43125)).toBe(false)
    expect(permit.allows('localhost', 43125)).toBe(false)
    await expect(assertAllowedBrowserUrl('http://127.0.0.1:43125/catalog?kind=car', permit)).resolves.toBeUndefined()
    await expect(assertAllowedBrowserUrl('http://127.0.0.1:43126/catalog', permit)).rejects.toMatchObject({
      code: 'TALOS_BROWSER_INVALID_NAVIGATION_URL',
    })
    await expect(assertAllowedBrowserUrl('http://user:pass@127.0.0.1:43125/catalog', permit)).rejects.toMatchObject({
      code: 'TALOS_BROWSER_INVALID_NAVIGATION_URL',
    })
  })

  it('HJ-PERMIT-008 rejects WHATWG numeric IPv4 aliases before route admission', async () => {
    const permit = enabledPermit(43125)

    for (const url of [
      'http://127.1:43125/catalog',
      'http://2130706433:43125/catalog',
      'http://0x7f000001:43125/catalog',
    ]) {
      await expect(assertAllowedBrowserUrl(url, permit)).rejects.toMatchObject({
        code: 'TALOS_BROWSER_INVALID_NAVIGATION_URL',
      })
    }
  })

  it.each([
    '',
    '   ',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'https://127.0.0.1:43125',
    'http://localhost:43125',
    'http://127.0.0.1.:43125',
    'http://127.1:43125',
    'http://[::1]:43125',
    'http://*.localhost:43125',
    'http://user:pass@127.0.0.1:43125',
    'http://127.0.0.1:43125/path',
    'http://127.0.0.1:43125/?query=1',
    'http://127.0.0.1:43125/#fragment',
    'http://127.0.0.1:1-65535',
    'file:///tmp/fixture',
  ])('HJ-PERMIT-004 rejects malformed or broadened test origin %j', (origin) => {
    expect(() => BrowserTestFixturePermit.fromEnvironment({
      TALOS_BROWSER_TEST_FIXTURE_ORIGIN: origin,
    }, 'test')).toThrowError(expect.objectContaining({
      code: 'TALOS_BROWSER_TEST_FIXTURE_ORIGIN_INVALID',
    }))
  })

  it('HJ-PERMIT-002 pins the exact proxy socket without DNS resolution', async () => {
    const permit = enabledPermit(43125)
    let resolveCalls = 0
    let connected: { address: string; port: number } | undefined
    const proxy = new BrowserEgressProxy({
      fixturePermit: permit,
      resolve: async () => {
        resolveCalls += 1
        return ['93.184.216.34']
      },
      connect: async (address, port) => {
        connected = { address, port }
        throw new Error('fixture connector stop')
      },
    })

    await expect(proxy.connectVettedAddress('127.0.0.1', 43125)).rejects.toThrow('fixture connector stop')
    expect(resolveCalls).toBe(0)
    expect(connected).toEqual({ address: '127.0.0.1', port: 43125 })
    connected = undefined
    await expect(proxy.connectVettedAddress('127.0.0.1', 43126)).rejects.toMatchObject({
      code: 'TALOS_BROWSER_PROXY_PORT_DENIED',
    })
    expect(connected).toBeUndefined()
  })

  it('HJ-PERMIT-009 rejects WHATWG IPv4 aliases at the raw proxy boundary', async () => {
    const permit = enabledPermit(43125)
    let connectCalls = 0
    const proxy = new BrowserEgressProxy({
      fixturePermit: permit,
      connect: async () => {
        connectCalls += 1
        throw new Error('alternate authority must not connect')
      },
    })
    await proxy.start()

    try {
      const response = await rawProxyRequest(
        proxy,
        'GET http://127.1:43125/catalog HTTP/1.1\r\nHost: 127.1:43125\r\nConnection: close\r\n\r\n',
      )

      expect(response).toMatch(/^HTTP\/1\.1 403 /u)
      expect(connectCalls).toBe(0)
    } finally {
      await proxy.close()
    }
  })

  it('HJ-PERMIT-005 preserves private metadata and mixed-answer rejection', async () => {
    const permit = enabledPermit(43125)
    for (const url of [
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.8/private',
      'http://192.168.1.8/private',
      'http://127.0.0.2:43125/private',
      'http://metadata.google.internal/private',
    ]) {
      await expect(assertAllowedBrowserUrl(url, permit)).rejects.toMatchObject({
        code: 'TALOS_BROWSER_INVALID_NAVIGATION_URL',
      })
    }

    const proxy = new BrowserEgressProxy({
      fixturePermit: permit,
      resolve: async () => ['93.184.216.34', '10.0.0.8'],
      connect: async () => new PassThrough(),
    })
    await expect(proxy.resolveVettedAddress('example.test', 443)).rejects.toMatchObject({
      code: 'TALOS_BROWSER_PROXY_PRIVATE_TARGET',
    })
  })

  it('HJ-PERMIT-006/HJ-PERMIT-007 reaches only the fixture through real route and proxy fences', async () => {
    let escapedRequests = 0
    const escape = await listen((request, response) => {
      escapedRequests += 1
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('must never be reached')
    })
    const escapePort = portOf(escape)
    const fixture = await listen((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: `http://${LOOPBACK}:${escapePort}/escaped` })
        response.end()
        return
      }
      response.writeHead(200, {
        'content-security-policy': "default-src 'self'; img-src http://127.0.0.1:*",
        'content-type': 'text/html; charset=utf-8',
      })
      response.end(`<!doctype html><title>Fixture</title><h1>Exact fixture reached</h1><img src="http://${LOOPBACK}:${escapePort}/private.png">`)
    })
    const fixturePort = portOf(fixture)
    const permit = enabledPermit(fixturePort)
    const manager = new BrowserSessionManager({
      fixturePermit: permit,
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    })
    openManagers.add(manager)

    const session = await manager.create({
      ownerRef: 'user:fixture',
      mode: 'read_only',
      viewport: { width: 960, height: 720 },
      ttlSeconds: 60,
      capabilities: {
        navigation: true,
        screenshots: true,
        accessibilitySnapshot: true,
        actions: false,
        downloads: false,
        uploads: false,
      },
    })
    await manager.navigate(session.sessionId, {
      url: `http://${LOOPBACK}:${fixturePort}/`,
      waitUntil: 'domcontentloaded',
      timeoutMs: 10_000,
    })
    const browserSession = await manager.get(session.sessionId)
    const heading = browserSession.page.getByRole('heading', { name: 'Exact fixture reached' })
    await heading.waitFor({ state: 'visible' })
    expect(await heading.isVisible()).toBe(true)
    expect(escapedRequests).toBe(0)

    await manager.navigate(session.sessionId, {
      url: `http://${LOOPBACK}:${fixturePort}/redirect`,
      waitUntil: 'domcontentloaded',
      timeoutMs: 10_000,
    })
    const redirectedSession = await manager.get(session.sessionId)
    expect(redirectedSession.page.url()).not.toBe(`http://${LOOPBACK}:${escapePort}/escaped`)
    expect(escapedRequests).toBe(0)
  }, 30_000)

  it('HJ-PERMIT-002/HJ-PERMIT-007/HJ-PERMIT-010 wires one captured permit through REST and canonical tool boundaries', async () => {
    const fixture = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>REST fixture</title><h1>REST boundary reached</h1>')
    })
    const fixturePort = portOf(fixture)
    const workerToken = 'fixture-worker-token'
    const ownerRef = 'user:fixture-rest'
    const headers = {
      'x-talos-worker-token': workerToken,
      'x-talos-owner-ref': ownerRef,
    }
    const app = buildServer({
      internalToken: workerToken,
      runtimeEnvironment: 'test',
      environment: {
        NODE_ENV: 'test',
        TALOS_BROWSER_TEST_FIXTURE_ORIGIN: `http://${LOOPBACK}:${fixturePort}`,
      },
    })

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers,
        payload: {
          ownerRef,
          mode: 'read_only',
          viewport: { width: 960, height: 720 },
          ttlSeconds: 60,
          capabilities: {
            navigation: true,
            screenshots: true,
            accessibilitySnapshot: true,
            actions: false,
            downloads: false,
            uploads: false,
          },
        },
      })
      expect(created.statusCode).toBe(201)

      const navigated = await app.inject({
        method: 'POST',
        url: `/sessions/${created.json().data.sessionId}/navigate`,
        headers,
        payload: {
          url: `http://${LOOPBACK}:${fixturePort}/catalog`,
          waitUntil: 'domcontentloaded',
          timeoutMs: 10_000,
        },
      })

      expect(navigated.statusCode).toBe(200)
      expect(navigated.json().data).toMatchObject({
        url: `http://${LOOPBACK}:${fixturePort}/catalog`,
        title: 'REST fixture',
      })

      const toolCall = await app.inject({
        method: 'POST',
        url: `/sessions/${created.json().data.sessionId}/tools/call`,
        headers,
        payload: {
          tool_use_id: 'fixture-tool-navigation',
          name: 'browser_navigate',
          arguments: {
            url: `http://${LOOPBACK}:${fixturePort}/catalog?via=tool`,
            state_version: 1,
          },
        },
      })

      expect(toolCall.statusCode).toBe(200)
      expect(toolCall.json()).toMatchObject({
        tool_use_id: 'fixture-tool-navigation',
        isError: false,
        structuredContent: {
          url: `http://${LOOPBACK}:${fixturePort}/catalog`,
          title: 'REST fixture',
          state_version: 2,
        },
      })
    } finally {
      await app.close()
    }
  }, 30_000)
})

function enabledPermit(port: number): BrowserTestFixturePermit {
  return BrowserTestFixturePermit.fromEnvironment({
    TALOS_BROWSER_TEST_FIXTURE_ORIGIN: `http://${LOOPBACK}:${port}`,
  }, 'test')
}

async function listen(handler: RequestListener): Promise<Server> {
  const server = createServer(handler)
  openServers.add(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, LOOPBACK, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

function portOf(server: Server): number {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Fixture server is not listening.')
  return address.port
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function rawProxyRequest(proxy: BrowserEgressProxy, request: string): Promise<string> {
  const port = Number(new URL(proxy.serverUrl).port)
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, LOOPBACK)
    let response = ''
    socket.setTimeout(5_000, () => socket.destroy(new Error('Proxy response timed out.')))
    socket.on('data', (chunk) => { response += chunk.toString() })
    socket.once('error', reject)
    socket.once('end', () => resolve(response))
    socket.once('connect', () => socket.write(request))
  })
}
