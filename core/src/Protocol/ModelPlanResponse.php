<?php

declare(strict_types=1);

namespace Kadmos\Protocol;

final readonly class ModelPlanResponse
{
    /** @param list<array<string, mixed>>|null $mutations */
    private function __construct(
        public string $text,
        public ?array $mutations,
        public ?string $parseError,
    ) {
    }

    public static function parse(string $raw, bool $strictPlanMode = false): self
    {
        if (preg_match('/```(?:json)?\s*\n?(.*?)\n?```/s', $raw, $matches) === 1) {
            $mutations = self::decodeMutationList(trim($matches[1]));
            if ($mutations !== null) {
                return new self(trim(str_replace($matches[0], '', $raw)), $mutations, null);
            }

            return new self(
                trim(str_replace($matches[0], '', $raw)),
                null,
                'model_plan: fenced JSON is not a valid JMP mutation list.',
            );
        }

        $trimmed = trim($raw);
        $mutationSegments = self::extractMutationSegments($raw);
        if (count($mutationSegments) > 1) {
            return new self('', null, 'model_plan: multiple text mutation plans are ambiguous.');
        }
        if (count($mutationSegments) === 1) {
            $segment = $mutationSegments[0];
            return new self(self::withoutSegment($raw, $segment['offset'], $segment['end']), $segment['mutations'], null);
        }

        $planObject = self::extractPlanObject($raw);
        if ($planObject !== null) {
            return new self(
                self::withoutSegment($raw, $planObject['offset'], $planObject['end']),
                null,
                'model_plan: function-call JSON objects are not a valid JMP mutation list.',
            );
        }

        if (str_starts_with($trimmed, '[')) {
            try {
                $decoded = json_decode($trimmed, true, flags: JSON_THROW_ON_ERROR);
                if (! $strictPlanMode && is_array($decoded)) {
                    return new self($trimmed, null, null);
                }
            } catch (\JsonException) {
                // The controlled plan fault below is more actionable than the raw decoder error.
            }

            return new self('', null, 'model_plan: JSON is not a valid JMP mutation list.');
        }

        if (preg_match('/(?:^|\R)\s*[\[{].*(?:"action"|"node_type"|"operation"|"tool_calls"|"arguments")/s', $raw) === 1) {
            return new self('', null, 'model_plan: plan-like JSON is malformed or unsupported.');
        }

        if ($strictPlanMode
            && (preg_match('/(?:talos_browser_read|"(?:action|node_type|operation|tool_calls|arguments|function|mutations)"\s*:)/i', $raw) === 1
                || preg_match('/(?:^|:\s*)[\[{]\s*"/s', $raw) === 1)) {
            return new self('', null, 'model_plan: incomplete or unsupported structured Browser output.');
        }

        return new self($trimmed, null, null);
    }

    public static function containsStructuredJson(string $raw): bool
    {
        $length = strlen($raw);
        for ($offset = 0; $offset < $length; $offset++) {
            $open = $raw[$offset];
            if (! in_array($open, ['[', '{'], true)) {
                continue;
            }

            $end = self::jsonSegmentEnd($raw, $offset, $open, $open === '[' ? ']' : '}');
            if ($end === null) {
                continue;
            }

            try {
                $decoded = json_decode(substr($raw, $offset, $end - $offset + 1), true, flags: JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                continue;
            }

            if (is_array($decoded)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<array{offset: int, end: int, mutations: list<array<string, mixed>>}> */
    private static function extractMutationSegments(string $raw): array
    {
        $segments = [];
        $offset = 0;
        while (($candidateOffset = strpos($raw, '[', $offset)) !== false) {
            $candidateEnd = self::jsonSegmentEnd($raw, $candidateOffset, '[', ']');
            if ($candidateEnd === null) {
                break;
            }

            $mutations = self::decodeMutationList(substr($raw, $candidateOffset, $candidateEnd - $candidateOffset + 1));
            if ($mutations !== null && self::isStandaloneJsonBoundary($raw, $candidateOffset)) {
                $segments[] = ['offset' => $candidateOffset, 'end' => $candidateEnd, 'mutations' => $mutations];
                $offset = $candidateEnd + 1;
                continue;
            }
            $offset = $candidateOffset + 1;
        }

        return $segments;
    }

    /** @return array{offset: int, end: int}|null */
    private static function extractPlanObject(string $raw): ?array
    {
        $offset = 0;
        while (($candidateOffset = strpos($raw, '{', $offset)) !== false) {
            $candidateEnd = self::jsonSegmentEnd($raw, $candidateOffset, '{', '}');
            if ($candidateEnd === null) {
                break;
            }

            try {
                $decoded = json_decode(substr($raw, $candidateOffset, $candidateEnd - $candidateOffset + 1), true, flags: JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                $offset = $candidateOffset + 1;
                continue;
            }

            if (is_array($decoded)
                && ! array_is_list($decoded)
                && self::looksLikePlanObject($decoded)
                && self::isStandaloneJsonBoundary($raw, $candidateOffset)) {
                return ['offset' => $candidateOffset, 'end' => $candidateEnd];
            }
            $offset = $candidateEnd + 1;
        }

        return null;
    }

    private static function jsonSegmentEnd(string $raw, int $start, string $open, string $close): ?int
    {
        $depth = 0;
        $inString = false;
        $escaped = false;
        $length = strlen($raw);

        for ($index = $start; $index < $length; $index++) {
            $character = $raw[$index];
            if ($inString) {
                if ($escaped) {
                    $escaped = false;
                } elseif ($character === '\\') {
                    $escaped = true;
                } elseif ($character === '"') {
                    $inString = false;
                }
                continue;
            }

            if ($character === '"') {
                $inString = true;
            } elseif ($character === $open) {
                $depth++;
            } elseif ($character === $close) {
                $depth--;
                if ($depth === 0) {
                    return $index;
                }
            }
        }

        return null;
    }

    private static function isStandaloneJsonBoundary(string $raw, int $offset): bool
    {
        $containerDepth = 0;
        $inString = false;
        $escaped = false;
        for ($index = 0; $index < $offset; $index++) {
            $character = $raw[$index];
            if ($containerDepth > 0 && $inString) {
                if ($escaped) {
                    $escaped = false;
                } elseif ($character === '\\') {
                    $escaped = true;
                } elseif ($character === '"') {
                    $inString = false;
                }
                continue;
            }

            if ($containerDepth > 0 && $character === '"') {
                $inString = true;
            } elseif ($containerDepth > 0 && in_array($character, ['[', '{'], true)) {
                $containerDepth++;
            } elseif ($containerDepth === 0
                && in_array($character, ['[', '{'], true)
                && self::looksLikeJsonContainerStart($raw, $index, $character)) {
                $containerDepth = 1;
            } elseif (in_array($character, [']', '}'], true) && $containerDepth > 0) {
                $containerDepth--;
            }
        }

        return $containerDepth === 0;
    }

    private static function looksLikeJsonContainerStart(string $raw, int $offset, string $open): bool
    {
        $suffix = ltrim(substr($raw, $offset + 1, 80));
        if ($suffix === '') {
            return false;
        }
        if ($open === '{') {
            return str_starts_with($suffix, '"') || str_starts_with($suffix, '}');
        }

        return preg_match('/^(?:\]|\[|\{|"|-?\d|true\b|false\b|null\b)/', $suffix) === 1;
    }

    private static function withoutSegment(string $raw, int $start, int $end): string
    {
        $before = trim(substr($raw, 0, $start));
        $after = trim(substr($raw, $end + 1));

        return $before !== '' && $after !== '' ? $before."\n\n".$after : $before.$after;
    }

    /** @param array<string, mixed> $value */
    private static function looksLikePlanObject(array $value, int $depth = 0): bool
    {
        $planKeys = ['action', 'node_type', 'operation', 'arguments', 'tool_calls', 'function', 'mutations'];
        if (array_intersect(array_keys($value), $planKeys) !== []) {
            return true;
        }
        if ($depth >= 2) {
            return false;
        }

        foreach ($value as $nested) {
            if (is_array($nested) && ! array_is_list($nested) && self::looksLikePlanObject($nested, $depth + 1)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<array<string, mixed>>|null */
    private static function decodeMutationList(string $json): ?array
    {
        try {
            $decoded = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (! is_array($decoded) || ! array_is_list($decoded)) return null;
        foreach ($decoded as $mutation) {
            if (! is_array($mutation)
                || ! is_string($mutation['action'] ?? null)
                || ! in_array($mutation['action'], ['SPAWN_NODE', 'MUTATE_PAYLOAD', 'YIELD_EXECUTION'], true)) {
                return null;
            }
        }

        return $decoded;
    }
}
