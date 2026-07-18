<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Services\FileIngestion\TalosBenchmarkScenarioMaterializer;
use RuntimeException;

final class FailingTalosBenchmarkScenarioMaterializer implements TalosBenchmarkScenarioMaterializer
{
    /** @param array<string, mixed> $ingestedFile */
    public function create(array $ingestedFile): array
    {
        throw new RuntimeException('forced benchmark scenario materialization failure');
    }

    /** @param array<string, mixed> $scenario */
    public function discard(array $scenario): void {}
}
