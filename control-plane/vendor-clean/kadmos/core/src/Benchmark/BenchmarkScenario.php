<?php

declare(strict_types=1);

namespace Kadmos\Benchmark;

use InvalidArgumentException;

final readonly class BenchmarkScenario
{
    /**
     * @param array<string, mixed> $data
     */
    private function __construct(
        private array $data,
        private string $path,
    ) {
    }

    public static function fromFile(string $path): self
    {
        if (!is_file($path)) {
            throw new InvalidArgumentException("Benchmark scenario not found: {$path}");
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (!is_array($decoded)) {
            throw new InvalidArgumentException("Benchmark scenario is not valid JSON: {$path}");
        }

        foreach (['name', 'difficulty', 'steps'] as $field) {
            if (!array_key_exists($field, $decoded)) {
                throw new InvalidArgumentException("Benchmark scenario missing required field: {$field}");
            }
        }

        if (!is_array($decoded['steps'])) {
            throw new InvalidArgumentException('Benchmark scenario steps must be an array.');
        }

        return new self($decoded, $path);
    }

    public function path(): string
    {
        return $this->path;
    }

    public function name(): string
    {
        return (string) $this->data['name'];
    }

    public function difficulty(): int
    {
        return (int) $this->data['difficulty'];
    }

    public function description(): string
    {
        return (string) ($this->data['description'] ?? '');
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function steps(): array
    {
        return array_values($this->data['steps']);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function injectedError(): ?array
    {
        $error = $this->data['inject_error_at'] ?? null;

        return is_array($error) ? $error : null;
    }

    /**
     * @return array<string, string>
     */
    public function expectedState(): array
    {
        $state = $this->data['expected_state'] ?? [];
        if (!is_array($state)) {
            return [];
        }

        $normalized = [];
        foreach ($state as $nodeId => $status) {
            $normalized[(string) $nodeId] = (string) $status;
        }

        return $normalized;
    }

    public function expectsAllSuccess(): bool
    {
        return (bool) ($this->data['expected_all_success'] ?? false);
    }

    public function expectedNodes(): int
    {
        return (int) ($this->data['expected_nodes'] ?? count($this->nodeIds()));
    }

    /**
     * @return list<string>
     */
    public function nodeIds(): array
    {
        $ids = [];
        foreach ($this->steps() as $step) {
            $mutations = $step['mutations'] ?? [];
            if (!is_array($mutations)) {
                continue;
            }

            foreach ($mutations as $mutation) {
                if (is_array($mutation) && ($mutation['action'] ?? null) === 'SPAWN_NODE' && isset($mutation['node_id'])) {
                    $nodeId = (string) $mutation['node_id'];
                    if (!in_array($nodeId, $ids, true)) {
                        $ids[] = $nodeId;
                    }
                }
            }
        }

        return $ids;
    }

    public function mutationCount(): int
    {
        $count = 0;
        foreach ($this->steps() as $step) {
            $mutations = $step['mutations'] ?? [];
            if (is_array($mutations)) {
                $count += count($mutations);
            }
        }

        return $count;
    }

    public function simulatedLatencyMs(): int
    {
        $latency = 0;
        foreach ($this->steps() as $step) {
            $mutations = $step['mutations'] ?? [];
            if (!is_array($mutations)) {
                continue;
            }

            foreach ($mutations as $mutation) {
                if (!is_array($mutation) || ($mutation['action'] ?? null) !== 'MUTATE_PAYLOAD') {
                    continue;
                }
                $payload = $mutation['payload'] ?? [];
                if (is_array($payload)) {
                    $latency += (int) ($payload['simulated_delay_ms'] ?? 0);
                }
            }
        }

        return $latency;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->data;
    }
}
