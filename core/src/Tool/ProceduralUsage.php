<?php

declare(strict_types=1);

namespace Kadmos\Tool;

final readonly class ProceduralUsage
{
    public function __construct(
        public int $calls = 0,
        public int $navigations = 0,
        public int $screenshots = 0,
        public int $evidenceNodes = 0,
        public int $elapsedMilliseconds = 0,
        public int $inputTokens = 0,
        public int $outputTokens = 0,
        public int $costMicros = 0,
    ) {
        foreach (get_object_vars($this) as $name => $value) {
            ToolContractGuard::jsonSafeNonNegativeInteger($value, sprintf('Procedural usage %s', $name));
        }
    }
}
