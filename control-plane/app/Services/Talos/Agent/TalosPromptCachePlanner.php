<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosModelProfile;
use App\Services\Models\ProviderPromptCacheCapabilityTable;
use InvalidArgumentException;
use JsonException;
use Kadmos\Provider\PromptCachePlan;
use Kadmos\Tool\ToolDefinition;
use stdClass;

final class TalosPromptCachePlanner
{
    private const STABLE_PREFIX_IDENTITY = 'talos.agent.stable_prefix.v1';

    /**
     * @param list<array{role: string, content: string}> $messages
     * @param list<ToolDefinition> $tools
     *
     * @throws JsonException
     */
    public function plan(
        TalosModelProfile $profile,
        mixed $preferences,
        string $systemPrompt,
        array $messages,
        array $tools,
    ): ?PromptCachePlan {
        $capability = ProviderPromptCacheCapabilityTable::resolve(
            (string) $profile->provider,
            (string) $profile->model,
        );
        if ($capability['supported'] !== true) {
            return null;
        }

        [$requestedMode, $requestedTtl] = $this->requestedPolicy($preferences);
        $mode = in_array($requestedMode, $capability['modes'], true)
            ? $requestedMode
            : PromptCachePlan::MODE_PROVIDER_DEFAULT;
        if (! in_array($mode, $capability['modes'], true)) {
            return null;
        }

        $ttl = null;
        $breakpoints = [];
        $minimumInputTokens = $capability['minimum_input_tokens'];
        if (in_array($mode, [PromptCachePlan::MODE_AUTOMATIC, PromptCachePlan::MODE_EXPLICIT], true)) {
            if ($requestedTtl !== null && ! in_array($requestedTtl, $capability['ttls'], true)) {
                $mode = PromptCachePlan::MODE_PROVIDER_DEFAULT;
            } else {
                $ttl = $requestedTtl;
                $breakpoints = $this->breakpoints(
                    $capability['breakpoints'],
                    $systemPrompt,
                    $messages,
                    $tools,
                    $mode === PromptCachePlan::MODE_AUTOMATIC ? 3 : 4,
                );
                if ($mode === PromptCachePlan::MODE_EXPLICIT && $breakpoints === []) {
                    $mode = PromptCachePlan::MODE_PROVIDER_DEFAULT;
                    $ttl = null;
                }
            }
        }
        if ($mode === PromptCachePlan::MODE_PROVIDER_DEFAULT) {
            $ttl = null;
            $breakpoints = [];
        }
        if ($mode === PromptCachePlan::MODE_DISABLED) {
            $ttl = null;
            $breakpoints = [];
            $minimumInputTokens = null;
        }

        return PromptCachePlan::forStablePrefix(
            mode: $mode,
            provider: (string) $profile->provider,
            model: (string) $profile->model,
            stableSystemIdentity: hash('sha256', $systemPrompt),
            stableToolSchemaIdentity: $this->toolSchemaIdentity($tools),
            stablePrefixIdentity: hash('sha256', self::STABLE_PREFIX_IDENTITY),
            breakpoints: $breakpoints,
            ttl: $ttl,
            minimumInputTokens: $minimumInputTokens,
        );
    }

    /** @return array{0: string, 1: ?string} */
    private function requestedPolicy(mixed $preferences): array
    {
        if (! is_array($preferences)
            || ! is_array($preferences['prompt_cache'] ?? null)
            || array_is_list($preferences['prompt_cache'])) {
            return [PromptCachePlan::MODE_AUTOMATIC, null];
        }

        $policy = $preferences['prompt_cache'];
        $mode = $policy['mode'] ?? PromptCachePlan::MODE_AUTOMATIC;
        $ttl = $policy['ttl'] ?? null;
        if (! is_string($mode) || ($ttl !== null && ! is_string($ttl))) {
            return [PromptCachePlan::MODE_PROVIDER_DEFAULT, null];
        }

        return [$mode, $ttl];
    }

    /**
     * @param list<string> $supported
     * @param list<array{role: string, content: string}> $messages
     * @param list<ToolDefinition> $tools
     * @return list<string>
     */
    private function breakpoints(
        array $supported,
        string $systemPrompt,
        array $messages,
        array $tools,
        int $limit,
    ): array {
        $breakpoints = [];
        foreach ($supported as $breakpoint) {
            if ($breakpoint === PromptCachePlan::BREAKPOINT_TOOLS && $tools !== []) {
                $breakpoints[] = PromptCachePlan::BREAKPOINT_TOOLS;
            } elseif ($breakpoint === PromptCachePlan::BREAKPOINT_SYSTEM && trim($systemPrompt) !== '') {
                $breakpoints[] = PromptCachePlan::BREAKPOINT_SYSTEM;
            } elseif ($breakpoint === 'message' && $messages !== []) {
                $breakpoints[] = 'message:'.array_key_last($messages);
            }
        }

        return array_slice($breakpoints, 0, $limit);
    }

    /**
     * @param list<ToolDefinition> $tools
     *
     * @throws JsonException
     */
    private function toolSchemaIdentity(array $tools): string
    {
        $schemas = [];
        foreach ($tools as $tool) {
            if (! $tool instanceof ToolDefinition) {
                throw new InvalidArgumentException('Prompt cache tools must be canonical tool definitions.');
            }
            $schemas[] = $this->canonicalize($tool->toWireArray());
        }
        usort(
            $schemas,
            static fn (array $left, array $right): int => strcmp(
                (string) ($left['name'] ?? ''),
                (string) ($right['name'] ?? ''),
            ),
        );

        return hash('sha256', json_encode(
            $schemas,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
        ));
    }

    private function canonicalize(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $value = get_object_vars($value);
            ksort($value, SORT_STRING);

            return (object) array_map($this->canonicalize(...), $value);
        }
        if (! is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map($this->canonicalize(...), $value);
        }

        ksort($value, SORT_STRING);

        return array_map($this->canonicalize(...), $value);
    }
}
