<?php

declare(strict_types=1);

namespace Kadmos;

interface LLMClientInterface
{
    /**
     * Sends a prompt to the LLM and returns the raw JMP response.
     *
     * @param string $prompt The serialized DAG state + instructions
     * @return string Raw JSON from the LLM (may contain multiple JMP commands)
     */
    public function generate(string $prompt): string;

    /**
     * Injects a validation fault into the LLM context for self-correction.
     *
     * @param list<array{field: string, expected: string, received: string, message: string}> $errors
     */
    public function injectFault(array $errors): void;
}
