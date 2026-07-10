import { lookup } from "node:dns/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { BrowserError } from "./BrowserErrors.js";
import { isPrivateOrReservedIp, isReservedHostname } from "./BrowserUrlPolicy.js";

export interface BrowserEgressProxyOptions {
  resolve?: (hostname: string) => Promise<string[]>;
  connect?: (address: string, port: number) => Promise<Duplex>;
}

const HTTP_PORT = 80;
const HTTPS_PORT = 443;

export class BrowserEgressProxy {
  private readonly resolveHost: (hostname: string) => Promise<string[]>;
  private readonly connectSocket: (address: string, port: number) => Promise<Duplex>;
  private server?: Server;
  private port?: number;

  constructor(options: BrowserEgressProxyOptions = {}) {
    this.resolveHost = options.resolve ?? (async (hostname) => (await lookup(hostname, { all: true })).map(({ address }) => address));
    this.connectSocket = options.connect ?? ((address, port) => new Promise<Duplex>((resolve, reject) => {
      const socket = createConnection({ host: address, port });
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    }));
  }

  get serverUrl(): string {
    if (this.port === undefined) throw new Error("Browser egress proxy has not started.");
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((socket) => void this.handleSocket(socket));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });
    this.port = (this.server.address() as { port: number }).port;
  }

  async close(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async resolveVettedAddress(hostname: string): Promise<string> {
    if (isReservedHostname(hostname.toLowerCase())) {
      throw new BrowserError("Proxy target hostname is reserved.", "TALOS_BROWSER_PROXY_PRIVATE_TARGET", 403);
    }
    let addresses: string[];
    try {
      addresses = await this.resolveHost(hostname);
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
    socket.once("error", () => socket.destroy());
    socket.once("data", async (chunk) => {
      try {
        const headerEnd = chunk.indexOf("\r\n\r\n");
        if (headerEnd < 0) throw new Error("incomplete proxy request");
        const header = chunk.subarray(0, headerEnd).toString("latin1");
        const [requestLine] = header.split("\r\n");
        const parts = requestLine.split(" ");
        if (parts.length !== 3) throw badRequest();
        const [method, target, version] = parts;
        if (!method || !target || (version !== "HTTP/1.0" && version !== "HTTP/1.1")) throw badRequest();
        if (method === "CONNECT") {
          const { hostname, port } = parseAuthority(target);
          assertEgressPort(port, HTTPS_PORT);
          const upstream = await this.connectVettedAddress(hostname, port);
          socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          const remainder = chunk.subarray(headerEnd + 4);
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
        const rewrittenLine = `${method} ${url.pathname || "/"}${url.search} ${version}`;
        const rewrittenHeader = `${rewrittenLine}\r\n${header.split("\r\n").slice(1).join("\r\n")}\r\n\r\n`;
        upstream.write(rewrittenHeader);
        const remainder = chunk.subarray(headerEnd + 4);
        if (remainder.length > 0) upstream.write(remainder);
        socket.pipe(upstream);
        upstream.pipe(socket);
      } catch (error) {
        const status = error instanceof BrowserError ? error.statusCode : 502;
        const reason = status === 400 ? "Bad Request" : status === 403 ? "Forbidden" : "Bad Gateway";
        socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
      }
    });
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
