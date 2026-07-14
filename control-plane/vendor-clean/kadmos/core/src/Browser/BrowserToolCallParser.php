<?php

declare(strict_types=1);

namespace Kadmos\Browser;

final class BrowserToolCallParser
{
    private const FUNCTION_NAME = 'talos_browser_read';

    /**
     * @param list<array<string, mixed>> $toolCalls
     * @return list<array<string, mixed>>|null
     */
    public static function toMutations(array $toolCalls): ?array
    {
        if ($toolCalls === []) return null;
        if (! array_is_list($toolCalls) || count($toolCalls) !== 1) {
            throw new \InvalidArgumentException('Browse mode accepts exactly one native tool call per planning turn.');
        }

        $toolCall = $toolCalls[0];
        $function = $toolCall['function'] ?? null;
        if (($toolCall['type'] ?? null) !== 'function'
            || ! is_array($function)
            || ($function['name'] ?? null) !== self::FUNCTION_NAME
            || ! is_string($function['arguments'] ?? null)) {
            throw new \InvalidArgumentException('Browse mode received an unsupported native tool call.');
        }

        try {
            $payload = json_decode($function['arguments'], true, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \InvalidArgumentException('Browse tool arguments are not valid JSON.');
        }

        if (! is_array($payload)) {
            throw new \InvalidArgumentException('Browse tool arguments must be a JSON object.');
        }
        $unknown = array_diff(array_keys($payload), ['operation', 'arguments', 'expected_evidence_hash']);
        $operation = $payload['operation'] ?? null;
        $arguments = $payload['arguments'] ?? null;
        $evidenceHash = $payload['expected_evidence_hash'] ?? null;
        if ($unknown !== []
            || ! is_string($operation)
            || trim($operation) === ''
            || ! is_array($arguments)
            || ($arguments !== [] && array_is_list($arguments))
            || (! is_null($evidenceHash) && ! is_string($evidenceHash))) {
            throw new \InvalidArgumentException('Browse tool arguments do not match the read-only command contract.');
        }

        return [
            ['action' => 'SPAWN_NODE', 'node_id' => 'browser_1', 'node_type' => 'BROWSER_COMMAND'],
            ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'browser_1', 'payload' => [
                'operation' => trim($operation),
                'arguments' => $arguments,
                'expected_evidence_hash' => $evidenceHash,
            ]],
        ];
    }
}
