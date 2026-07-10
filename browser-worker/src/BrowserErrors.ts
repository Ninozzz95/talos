export class BrowserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "BrowserError";
  }
}

export function errorPayload(error: unknown): {
  message: string;
  code: string;
  details: Record<string, unknown>;
} {
  if (error instanceof BrowserError) {
    return { message: error.message, code: error.code, details: error.details };
  }

  return {
    message: "Browser worker request failed.",
    code: "TALOS_BROWSER_WORKER_ERROR",
    details: {},
  };
}
