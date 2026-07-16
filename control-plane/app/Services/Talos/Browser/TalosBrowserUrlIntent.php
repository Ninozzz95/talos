<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final readonly class TalosBrowserUrlIntent
{
    /** @param list<string> $resolvedIps */
    public function __construct(
        public string $raw,
        public string $url,
        public string $unicodeUrl,
        public string $asciiHost,
        public string $unicodeHost,
        public int $startByte,
        public int $endByte,
        public string $textBefore,
        public string $textAfter,
        public string $classification,
        public float $confidence,
        public ?string $publicSuffix,
        public ?string $registrableDomain,
        public bool $allowed,
        public string $policyReason,
        public array $resolvedIps,
    ) {}

    /** @return array<string, mixed> */
    public function toSafeArray(): array
    {
        return [
            'raw' => $this->raw,
            'url' => $this->url,
            'unicode_url' => $this->unicodeUrl,
            'ascii_host' => $this->asciiHost,
            'unicode_host' => $this->unicodeHost,
            'start_byte' => $this->startByte,
            'end_byte' => $this->endByte,
            'text_before' => $this->textBefore,
            'text_after' => $this->textAfter,
            'classification' => $this->classification,
            'confidence' => $this->confidence,
            'public_suffix' => $this->publicSuffix,
            'registrable_domain' => $this->registrableDomain,
            'allowed' => $this->allowed,
            'policy_reason' => $this->policyReason,
            'resolved_ips' => $this->resolvedIps,
        ];
    }
}
