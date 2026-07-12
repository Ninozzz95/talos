import { existsSync, statSync } from "node:fs";
import { chromium } from "playwright";

const executable = chromium.executablePath();

if (!existsSync(executable) || !statSync(executable).isFile()) {
  process.stderr.write(`Chromium runtime missing: ${executable}\n`);
  process.exit(1);
}

process.stdout.write(`${executable}\n`);
