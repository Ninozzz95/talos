<?php

declare(strict_types=1);

namespace Kadmos\Security;

final readonly class ToolContextPolicy
{
    /** @var list<string> */
    private const LEGACY_DEFAULT_TOOLS = ['HTTP_REQUEST', 'QUERY_DATABASE'];

    /**
     * @param list<string> $allowedToolNames
     */
    private function __construct(
        private array $allowedToolNames,
        private bool $registryProvided,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     */
    public static function fromInput(array $input): self
    {
        if (!array_key_exists('tool_context', $input)) {
            return new self(self::LEGACY_DEFAULT_TOOLS, false);
        }

        $toolContext = is_array($input['tool_context']) ? $input['tool_context'] : [];
        $tools = isset($toolContext['tools']) && is_array($toolContext['tools']) ? $toolContext['tools'] : [];
        $allowed = [];

        foreach ($tools as $tool) {
            if (!is_array($tool)) {
                continue;
            }

            $name = isset($tool['name']) ? trim((string) $tool['name']) : '';
            if ($name !== '' && preg_match('/^[A-Z][A-Z0-9_]*$/', $name) === 1) {
                $allowed[$name] = true;
            }
        }

        return new self(array_keys($allowed), true);
    }

    /**
     * @return list<string>
     */
    public function allowedToolNames(): array
    {
        return $this->allowedToolNames;
    }

    public function registryProvided(): bool
    {
        return $this->registryProvided;
    }

    public function isAllowed(string $nodeType): bool
    {
        return in_array($nodeType, $this->allowedToolNames, true);
    }

    /**
     * @param list<array<string, mixed>> $mutations
     * @return list<string>
     */
    public function validateMutationBatch(array $mutations): array
    {
        $errors = [];

        foreach ($mutations as $index => $mutation) {
            if (($mutation['action'] ?? null) !== 'SPAWN_NODE') {
                continue;
            }

            $nodeType = (string) ($mutation['node_type'] ?? '');
            if ($nodeType === '' || $this->isAllowed($nodeType)) {
                continue;
            }

            $errors[] = "mutations[{$index}].node_type: tool {$nodeType} is not available in the TALOS registry planning context.";
        }

        return $errors;
    }
}
