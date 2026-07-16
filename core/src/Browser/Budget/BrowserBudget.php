<?php

declare(strict_types=1);

namespace Kadmos\Browser\Budget;

use InvalidArgumentException;

final readonly class BrowserBudget
{
    private const LIMITS = [
        'max_actions' => ['counter' => 'actions', 'required' => true, 'maximum' => 10000],
        'max_elapsed_ms' => ['counter' => 'elapsed_ms', 'required' => true, 'maximum' => 86400000],
        'max_bytes' => ['counter' => 'bytes', 'required' => true, 'maximum' => 10737418240],
        'max_tabs' => ['counter' => 'tabs', 'required' => true, 'maximum' => 128],
        'max_domains' => ['counter' => 'domains', 'required' => false, 'maximum' => 128],
        'max_tokens' => ['counter' => 'tokens', 'required' => false, 'maximum' => 10000000],
    ];

    private const MAX_SAFE_INTEGER = 9007199254740991;

    /** @var array<string, int> */
    private array $limits;

    /** @param array<string, int> $limits */
    private function __construct(array $limits)
    {
        $this->limits = $limits;
    }

    /** @param array<string, mixed> $limits */
    public static function fromArray(array $limits): self
    {
        if (array_is_list($limits)) {
            throw new InvalidArgumentException('Browser budget limits must be an object-shaped array.');
        }

        foreach ($limits as $name => $value) {
            $definition = self::LIMITS[$name] ?? null;
            if ($definition === null) {
                throw new InvalidArgumentException("Browser budget limit {$name} is unsupported.");
            }
            if (! is_int($value) || $value < 1 || $value > $definition['maximum']) {
                throw new InvalidArgumentException("Browser budget limit {$name} is invalid.");
            }
        }

        foreach (self::LIMITS as $name => $definition) {
            if ($definition['required'] && ! array_key_exists($name, $limits)) {
                throw new InvalidArgumentException("Browser budget limit {$name} is required.");
            }
        }

        $canonical = [];
        foreach (self::LIMITS as $name => $definition) {
            if (array_key_exists($name, $limits)) {
                $canonical[$name] = $limits[$name];
            }
        }

        return new self($canonical);
    }

    /** @return array<string, int> */
    public function limits(): array
    {
        return $this->limits;
    }

    /**
     * @param array<string, mixed> $usage
     * @param array<string, mixed> $candidateDelta
     */
    public function evaluate(array $usage, array $candidateDelta = []): BrowserBudgetDecision
    {
        $current = $this->normalizeCounters($usage, 'usage');
        $delta = $this->normalizeCounters($candidateDelta, 'candidate delta');
        $projected = [];

        foreach (self::LIMITS as $definition) {
            $counter = $definition['counter'];
            if ($current[$counter] > self::MAX_SAFE_INTEGER - $delta[$counter]) {
                throw new InvalidArgumentException("Browser budget counter {$counter} exceeds the safe integer range.");
            }
            $projected[$counter] = $current[$counter] + $delta[$counter];
        }

        $exhausted = [];
        foreach (self::LIMITS as $limit => $definition) {
            if (isset($this->limits[$limit]) && $projected[$definition['counter']] > $this->limits[$limit]) {
                $exhausted[] = $limit;
            }
        }

        return new BrowserBudgetDecision($exhausted === [], $projected, $exhausted);
    }

    /**
     * @param array<string, mixed> $counters
     * @return array{actions: int, elapsed_ms: int, bytes: int, tabs: int, domains: int, tokens: int}
     */
    private function normalizeCounters(array $counters, string $label): array
    {
        if (array_is_list($counters) && $counters !== []) {
            throw new InvalidArgumentException("Browser budget {$label} must be an object-shaped array.");
        }

        $normalized = [
            'actions' => 0,
            'elapsed_ms' => 0,
            'bytes' => 0,
            'tabs' => 0,
            'domains' => 0,
            'tokens' => 0,
        ];
        foreach ($counters as $counter => $value) {
            if (! array_key_exists($counter, $normalized)) {
                throw new InvalidArgumentException("Browser budget counter {$counter} is unsupported.");
            }
            if (! is_int($value) || $value < 0 || $value > self::MAX_SAFE_INTEGER) {
                throw new InvalidArgumentException("Browser budget counter {$counter} is invalid.");
            }
            $normalized[$counter] = $value;
        }

        return $normalized;
    }
}
