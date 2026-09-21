import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';

export default class RipresaReporter {
  constructor({ output }) {
    this.fd = openSync(join(output, 'events.jsonl'), 'wx');
    this.failed = false;
  }
  record(value) {
    try {
      writeSync(this.fd, `${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`);
      fsyncSync(this.fd);
    } catch (error) {
      this.failed = true;
      process.stderr.write(`Registro ripresa non scrivibile: ${error.message}\n`);
    }
  }
  identity(test) {
    return { id: test.id, title: test.titlePath(), location: test.location, expectedStatus: test.expectedStatus };
  }
  onBegin(config, suite) { this.record({ type: 'begin', tests: suite.allTests().map(test => this.identity(test)) }); }
  onTestEnd(test, result) {
    this.record({ type: 'testEnd', ...this.identity(test), status: result.status, duration: result.duration, retry: result.retry, errors: result.errors, attachments: result.attachments.map(({ name, contentType, path }) => ({ name, contentType, path })) });
  }
  onError(error) { this.record({ type: 'error', error }); }
  onEnd(result) {
    this.record({ type: 'end', status: result.status, duration: result.duration });
    closeSync(this.fd);
    if (this.failed) return { status: 'failed' };
  }
  printsToStdio() { return false; }
}
