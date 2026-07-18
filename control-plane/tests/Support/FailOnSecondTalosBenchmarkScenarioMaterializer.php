<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Services\FileIngestion\FileBenchmarkScenarioFactory;
use App\Services\FileIngestion\TalosBenchmarkScenarioMaterializer;
use RuntimeException;

final class FailOnSecondTalosBenchmarkScenarioMaterializer implements TalosBenchmarkScenarioMaterializer
{
    private int $calls = 0;

    public function __construct(private readonly FileBenchmarkScenarioFactory $delegate) {}

    /** @param array<string, mixed> $ingestedFile */
    public function create(array $ingestedFile): array
    {
        $this->calls++;
        if ($this->calls === 2) {
            throw new RuntimeException('forced second benchmark scenario materialization failure');
        }

        return $this->delegate->create($ingestedFile);
    }

    /** @param array<string, mixed> $scenario */
    public function discard(array $scenario): void
    {
        $this->delegate->discard($scenario);
    }
}
