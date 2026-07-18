<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

interface TalosFilePipelineHealth
{
    /** @return array<string, array{status: string, detail: string, blocking?: bool}> */
    public function checks(): array;
}
