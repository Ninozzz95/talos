<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use RuntimeException;

final readonly class BrowserWorkerConfiguration
{
    private const MIN_PRODUCTION_TOKEN_BYTES = 32;
    private const MIN_PRODUCTION_TOKEN_ENTROPY_BITS = 128;

    public function __construct(
        private string $workerUrl,
        private string $workerToken,
        private bool $allowInsecureInternalTransport = false,
    ) {}

    public function url(): string
    {
        return trim($this->workerUrl);
    }

    public function token(): string
    {
        return $this->workerToken;
    }

    public function assertReadyFor(string $environment): void
    {
        if ($environment !== 'production') {
            return;
        }

        if ($this->url() === '') {
            throw new RuntimeException('TALOS_BROWSER_WORKER_URL is required in production. Start TALOS through the production launcher.');
        }

        $parts = parse_url($this->url());
        if (
            ! is_array($parts)
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || trim((string) ($parts['host'] ?? '')) === ''
        ) {
            throw new RuntimeException('TALOS_BROWSER_WORKER_URL must be an HTTP(S) URL with a host.');
        }

        if ($this->token() === '') {
            throw new RuntimeException('TALOS_BROWSER_WORKER_TOKEN is required in production. Start TALOS through the production launcher.');
        }

        if (strlen($this->token()) < self::MIN_PRODUCTION_TOKEN_BYTES) {
            throw new RuntimeException('TALOS_BROWSER_WORKER_TOKEN must contain at least 32 characters.');
        }

        $symbols = preg_split('//u', $this->token(), -1, PREG_SPLIT_NO_EMPTY);
        if (! is_array($symbols) || $this->estimatedShannonEntropyBits($symbols) < self::MIN_PRODUCTION_TOKEN_ENTROPY_BITS) {
            throw new RuntimeException('TALOS_BROWSER_WORKER_TOKEN must contain at least 128 bits of estimated entropy.');
        }

        if (strtolower((string) ($parts['scheme'] ?? '')) === 'http' && ! $this->allowInsecureInternalTransport) {
            throw new RuntimeException('TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT must be enabled explicitly for production HTTP worker transport.');
        }
    }

    /**
     * @param list<string> $symbols
     */
    private function estimatedShannonEntropyBits(array $symbols): float
    {
        $frequencies = array_count_values($symbols);
        $entropy = 0.0;
        $length = count($symbols);

        foreach ($frequencies as $count) {
            $probability = $count / $length;
            $entropy -= $probability * log($probability, 2);
        }

        return $entropy * $length;
    }
}
