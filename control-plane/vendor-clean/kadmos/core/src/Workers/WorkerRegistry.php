<?php

declare(strict_types=1);

namespace Kadmos\Workers;

final class WorkerRegistry
{
    /** @var array<string, NodeWorkerInterface> */
    private array $workers = [];

    public function register(string $nodeType, NodeWorkerInterface $worker): void
    {
        $this->workers[$nodeType] = $worker;
    }

    public function getWorker(string $nodeType): NodeWorkerInterface
    {
        if (!isset($this->workers[$nodeType])) {
            throw new \RuntimeException("No worker registered for node type: {$nodeType}");
        }

        return $this->workers[$nodeType];
    }

    public function has(string $nodeType): bool
    {
        return isset($this->workers[$nodeType]);
    }
}
