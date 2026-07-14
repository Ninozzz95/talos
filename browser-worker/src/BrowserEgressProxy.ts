import { lookup } from "node:dns/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { BrowserError } from "./BrowserErrors.js";
import { isPrivateOrReservedIp, isReservedHostname, normalizeHostname } from "./BrowserUrlPolicy.js";

export interface BrowserEgressProxyOptions {
  resolve?: (hostname: string) => Promise<string[]>;
  connect?: (address: string, port: number) => Promise<Duplex>;
  headerTimeoutMs?: number;
}

const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const MAX_PROXY_HEADER_BYTES = 16 * 1024;
const PROXY_HEADER_TIMEOUT_MS = 5_000;
const HEADER_TERMINATOR = Buffer.from("\r\n\r\n");

export class BrowserEgressProxy {
  private readonly resolveHost: (hostname: string) => Promise<string[]>;
  private readonly connectSocket: (address: string, port: number) => Promise<Duplex>;
  private readonly headerTimeoutMs: number;
  private readonly sockets = new Set<Duplex>();
  private server?: Server;
  private port?: number;
  private shuttingDown = false;
  private closePromise?: Promise<void>;

  constructor(options: BrowserEgressProxyOptions = {}) {
    this.resolveHost = options.resolve ?? (async (hostname) => (await lookup(hostname, { all: true })).map(({ address }) => address));
    this.connectSocket = options.connect ?? ((address, port) => new Promise<Duplex>((resolve, reject) => {
      const socket = createConnection({ host: address, port });
      if (!this.trackSocket(socket)) {
        socket.destroy();
        reject(new Error("Browser egress proxy is shutting down."));
        return;
      }
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    }));
    this.headerTimeoutMs = boundedHeaderTimeout(options.headerTimeoutMs);
  }

  get serverUrl(): string {
    if (this.port === undefined) throw new Error("Browser egress proxy has not started.");
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.shuttingDown = false;
    this.closePromise = undefined;
    this.server = createServer((socket) => void this.handleSocket(socket));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });
    this.port = (this.server.address() as { port: number }).port;
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    const server = this.server;
    this.shuttingDown = true;
    this.server = undefined;
    this.port = undefined;
    this.closePromise = (async () => {
      this.destroyTrackedSockets();
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    })();
    return this.closePromise;
  }

  async resolveVettedAddress(hostname: string): Promise<string> {
    const normalizedHostname = normalizeHostname(hostname);
    if (normalizedHostname === "") {
      throw new BrowserError("Proxy target hostname is invalid.", "TALOS_BROWSER_PROXY_PRIVATE_TARGET", 403);
    }
    if (isReservedHostname(normalizedHostname)) {
      throw new BrowserError("Proxy target hostname is reserved.", "TALOS_BROWSER_PROXY_PRIVATE_TARGET", 403);
    }
    let addresses: string[];
    try {
      addresses = await this.resolveHost(normalizedHostname);
    } catch {
      throw new BrowserError("Proxy DNS lookup failed.", "TALOS_BROWSER_PROXY_DNS_FAILED", 502);
    }
    if (addresses.length === 0 || addresses.some((address) => isPrivateOrReservedIp(address))) {
      throw new BrowserError("Proxy target resolves to a private or reserved address.", "TALOS_BROWSER_PROXY_PRIVATE_TARGET", 403);
    }
    return addresses[0];
  }

  async connectVettedAddress(hostname: string, port: number): Promise<Duplex> {
    assertEgressPort(port);
    return this.connectSocket(await this.resolveVettedAddress(hostname), port);
  }

  private async handleSocket(socket: Socket): Promise<void> {
    if (!this.trackSocket(socket)) {
      socket.destroy();
      return;
    }
    socket.once("error", () => socket.destroy());
    let header = Buffer.alloc(0);
    let parsing = true;
    const headerTimer = setTimeout(() => {
      if (parsing) rejectProxyRequest(badRequest());
    }, this.headerTimeoutMs);
    headerTimer.unref();

    const stopParsing = (): void => {
      if (!parsing) return;
      parsing = false;
      clearTimeout(headerTimer);
      socket.removeListener("data", onData);
    };
    const rejectProxyRequest = (error: unknown): void => {
      stopParsing();
      if (!socket.destroyed) socket.end(proxyErrorResponse(error));
    };
    const onData = (chunk: Buffer): void => {
      if (!parsing) return;
      const combinedLength = header.length + chunk.length;
      const inspectLength = Math.min(chunk.length, MAX_PROXY_HEADER_BYTES + HEADER_TERMINATOR.length - header.length);
      const candidate = Buffer.concat([header, chunk.subarray(0, Math.max(0, inspectLength))]);
      const headerEnd = candidate.indexOf(HEADER_TERMINATOR);
      if (headerEnd >= 0) {
        if (headerEnd + HEADER_TERMINATOR.length > MAX_PROXY_HEADER_BYTES) {
          rejectProxyRequest(headersTooLarge());
          return;
        }
        stopParsing();
        socket.pause();
        const headerLength = headerEnd + HEADER_TERMINATOR.length;
        const previousBytes = header.length;
        const headerBytes = Buffer.concat([header, chunk.subarray(0, Math.max(0, headerLength - previousBytes))]);
        const remainderStart = Math.max(0, headerLength - previousBytes);
        void this.processRequest(socket, headerBytes.subarray(0, headerEnd), chunk.subarray(remainderStart));
        return;
      }
      if (combinedLength > MAX_PROXY_HEADER_BYTES) {
        rejectProxyRequest(headersTooLarge());
        return;
      }
      header = candidate;
    };
    const onClose = (): void => stopParsing();
    socket.on("data", onData);
    socket.once("close", onClose);
  }

  private async processRequest(socket: Socket, headerBytes: Buffer, remainder: Buffer): Promise<void> {
    try {
      const header = headerBytes.toString("latin1");
      const [requestLine] = header.split("\r\n");
      const parts = requestLine.split(" ");
      if (parts.length !== 3) throw badRequest();
      const [method, target, version] = parts;
      if (!method || !target || (version !== "HTTP/1.0" && version !== "HTTP/1.1")) throw badRequest();
      if (method === "CONNECT") {
        const { hostname, port } = parseAuthority(target);
        assertEgressPort(port, HTTPS_PORT);
        const upstream = await this.connectVettedAddress(hostname, port);
        if (!this.trackSocket(upstream) || this.shuttingDown || socket.destroyed) {
          upstream.destroy();
          socket.destroy();
          return;
        }
        upstream.once("error", () => upstream.destroy());
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (remainder.length > 0) upstream.write(remainder);
        socket.pipe(upstream);
        upstream.pipe(socket);
        return;
      }
      if (!target.startsWith("http://")) throw badRequest();
      const url = new URL(target);
      if (url.username || url.password || !url.hostname) throw badRequest();
      const port = Number(url.port || HTTP_PORT);
      assertEgressPort(port, HTTP_PORT);
      const upstream = await this.connectVettedAddress(url.hostname, port);
      if (!this.trackSocket(upstream) || this.shuttingDown || socket.destroyed) {
        upstream.destroy();
        socket.destroy();
        return;
      }
      upstream.once("error", () => upstream.destroy());
      const rewrittenLine = `${method} ${url.pathname || "/"}${url.search} ${version}`;
      const rewrittenHeader = `${rewrittenLine}\r\n${header.split("\r\n").slice(1).join("\r\n")}\r\n\r\n`;
      upstream.write(rewrittenHeader);
      if (remainder.length > 0) upstream.write(remainder);
      socket.pipe(upstream);
      upstream.pipe(socket);
    } catch (error) {
      if (!socket.destroyed) socket.end(proxyErrorResponse(error));
    }
  }

  private trackSocket(socket: Duplex): boolean {
    if (this.shuttingDown) return false;
    if (this.sockets.has(socket)) return true;
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
    return true;
  }

  private destroyTrackedSockets(): void {
    for (const socket of this.sockets) socket.destroy();
  }
}

function parseAuthority(value: string): { hostname: string; port: number } {
  if (!value || value.includes("@") || /\s/.test(value)) throw badRequest();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    const suffix = value.slice(end + 1);
    if (end < 1 || !/^:\d+$/.test(suffix)) throw badRequest();
    return { hostname: value.slice(1, end), port: parsePort(suffix.slice(1)) };
  }
  const separator = value.lastIndexOf(":");
  if (separator <= 0 || value.indexOf(":") !== separator) throw badRequest();
  return { hostname: value.slice(0, separator), port: parsePort(value.slice(separator + 1)) };
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) throw badRequest();
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw badRequest();
  return port;
}

function assertEgressPort(port: number, expected?: number): void {
  if (port !== HTTP_PORT && port !== HTTPS_PORT) {
    throw new BrowserError("Proxy egress port is not allowed.", "TALOS_BROWSER_PROXY_PORT_DENIED", 403);
  }
  if (expected !== undefined && port !== expected) {
    throw new BrowserError("Proxy egress port is not allowed for this protocol.", "TALOS_BROWSER_PROXY_PORT_DENIED", 403);
  }
}

function badRequest(): BrowserError {
  return new BrowserError("Malformed proxy request.", "TALOS_BROWSER_PROXY_INVALID_REQUEST", 400);
}

function headersTooLarge(): BrowserError {
  return new BrowserError("Proxy request headers are too large.", "TALOS_BROWSER_PROXY_HEADERS_TOO_LARGE", 431);
}

function boundedHeaderTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return PROXY_HEADER_TIMEOUT_MS;
  return Math.min(Math.floor(value), PROXY_HEADER_TIMEOUT_MS);
}

function proxyErrorResponse(error: unknown): string {
  const status = error instanceof BrowserError ? error.statusCode : 502;
  const reason = status === 400
    ? "Bad Request"
    : status === 403
      ? "Forbidden"
      : status === 431
        ? "Request Header Fields Too Large"
        : "Bad Gateway";
  return `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`;
}
