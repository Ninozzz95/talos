<?php

declare(strict_types=1);

namespace AVM;

/**
 * Mock LLM client that returns pre-compiled JMP scripts.
 * Enables deterministic end-to-end testing without API costs.
 */
final class MockLLM implements LLMClientInterface
{
    /** @var list<string> */
    private array $script;

    private int $index = 0;

    /** @var list<array{field: string, expected: string, received: string, message: string}> */
    private array $injectedFaults = [];

    /**
     * @param list<string> $script Array of JSON JMP responses to return in sequence
     */
    public function __construct(array $script)
    {
        $this->script = $script;
    }

    public function generate(string $prompt): string
    {
        if ($this->index >= \count($this->script)) {
            // No more scripted responses — yield execution to stop the loop
            return \json_encode([['action' => 'YIELD_EXECUTION']]);
        }

        return $this->script[$this->index++];
    }

    public function injectFault(array $errors): void
    {
        $this->injectedFaults = \array_merge($this->injectedFaults, $errors);
    }

    /**
     * @return list<array{field: string, expected: string, received: string, message: string}>
     */
    public function getInjectedFaults(): array
    {
        return $this->injectedFaults;
    }

    /**
     * Returns true if all scripted responses have been consumed.
     */
    public function isExhausted(): bool
    {
        return $this->index >= \count($this->script);
    }
}
