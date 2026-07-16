<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final readonly class TalosPublicSuffixResolution
{
    public function __construct(
        public string $asciiHost,
        public ?string $suffix,
        public ?string $registrableDomain,
        public bool $isIp,
        public string $section,
    ) {}

    /** @return array{ascii_host: string, suffix: ?string, registrable_domain: ?string, is_ip: bool, section: string} */
    public function toSafeArray(): array
    {
        return [
            'ascii_host' => $this->asciiHost,
            'suffix' => $this->suffix,
            'registrable_domain' => $this->registrableDomain,
            'is_ip' => $this->isIp,
            'section' => $this->section,
        ];
    }
}
