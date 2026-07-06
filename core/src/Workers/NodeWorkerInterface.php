<?php

declare(strict_types=1);

namespace AVM\Workers;

interface NodeWorkerInterface
{
    /**
     * Executes the physical action associated with a node.
     *
     * @param array<string, mixed> $payload The payload validated syntactically by Node.js
     * @return array{status: string, output_summary: string, raw_output: mixed}
     */
    public function execute(array $payload): array;
}
