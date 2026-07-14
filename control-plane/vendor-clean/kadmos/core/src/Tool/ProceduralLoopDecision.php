<?php

declare(strict_types=1);

namespace Kadmos\Tool;

final readonly class ProceduralLoopDecision
{
    public function __construct(
        public bool $allowed,
        public string $fingerprint,
        public ?string $code = null,
    ) {
        ToolContractGuard::sha256($fingerprint, 'Procedural fingerprint');
        if ($allowed && $code !== null) {
            throw new \InvalidArgumentException('An allowed loop decision cannot carry an error code.');
        }
        if (! $allowed) {
            ToolContractGuard::nonEmptyString($code, 'Procedural loop decision code', 128);
        }
    }
}
