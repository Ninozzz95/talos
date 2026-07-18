<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

interface TalosBenchmarkScenarioMaterializer
{
    /**
     * @param  array<string, mixed>  $ingestedFile
     * @return array<string, mixed>
     */
    public function create(array $ingestedFile): array;

    /** @param array<string, mixed> $scenario */
    public function discard(array $scenario): void;
}
