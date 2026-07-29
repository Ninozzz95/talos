<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use JsonException;

final readonly class PromptCachePlan
{
    public const CONTRACT_VERSION = 'talos.prompt_cache_plan.v1';

    public const MODE_PROVIDER_DEFAULT = 'provider_default';
    public const MODE_AUTOMATIC = 'automatic';
    public const MODE_EXPLICIT = 'explicit';
    public const MODE_DISABLED = 'disabled';

    public const BREAKPOINT_TOOLS = 'tools';
    public const BREAKPOINT_SYSTEM = 'system';

    public const TTL_5_MINUTES = '5m';
    public const TTL_30_MINUTES = '30m';
    public const TTL_1_HOUR = '1h';

    private const MODES = [
        self::MODE_PROVIDER_DEFAULT,
        self::MODE_AUTOMATIC,
        self::MODE_EXPLICIT,
        self::MODE_DISABLED,
    ];

    private const TTLS = [
        self::TTL_5_MINUTES,
        self::TTL_30_MINUTES,
        self::TTL_1_HOUR,
    ];

    /**
     * @param list<string> $breakpoints
     */
    public function __construct(
        public string $mode,
        public string $keyHash,
        public array $breakpoints,
        public ?string $ttl,
        public ?int $minimumInputTokens,
    ) {
        if (! in_array($mode, self::MODES, true)) {
            throw new InvalidArgumentException('Prompt cache mode is unsupported.');
        }
        if (preg_match('/^[a-f0-9]{64}$/', $keyHash) !== 1) {
            throw new InvalidArgumentException('Prompt cache key must be a lowercase SHA-256 digest.');
        }
        if (! array_is_list($breakpoints) || count($breakpoints) > 4) {
            throw new InvalidArgumentException('Prompt cache breakpoints must be a list of at most four values.');
        }

        $seen = [];
        foreach ($breakpoints as $breakpoint) {
            if (! is_string($breakpoint)
                || ($breakpoint !== self::BREAKPOINT_TOOLS
                    && $breakpoint !== self::BREAKPOINT_SYSTEM
                    && preg_match('/^message:(0|[1-9][0-9]{0,5})$/', $breakpoint) !== 1)) {
                throw new InvalidArgumentException('Prompt cache breakpoint is unsupported.');
            }
            if (isset($seen[$breakpoint])) {
                throw new InvalidArgumentException('Prompt cache breakpoints must be unique.');
            }
            $seen[$breakpoint] = true;
        }

        if ($ttl !== null && ! in_array($ttl, self::TTLS, true)) {
            throw new InvalidArgumentException('Prompt cache TTL is unsupported.');
        }
        if ($minimumInputTokens !== null && $minimumInputTokens < 1) {
            throw new InvalidArgumentException('Prompt cache minimum input tokens must be positive.');
        }
        if ($mode === self::MODE_EXPLICIT && $breakpoints === []) {
            throw new InvalidArgumentException('Explicit prompt caching requires at least one breakpoint.');
        }
        if ($mode === self::MODE_PROVIDER_DEFAULT && ($breakpoints !== [] || $ttl !== null)) {
            throw new InvalidArgumentException('Provider-default prompt caching cannot carry managed breakpoints or TTL.');
        }
        if ($mode === self::MODE_DISABLED
            && ($breakpoints !== [] || $ttl !== null || $minimumInputTokens !== null)) {
            throw new InvalidArgumentException('Disabled prompt caching cannot carry cache-write policy.');
        }
    }

    /**
     * @param list<string> $breakpoints
     *
     * @throws JsonException
     */
    public static function forStablePrefix(
        string $mode,
        string $provider,
        string $model,
        string $stableSystemIdentity,
        string $stableToolSchemaIdentity,
        string $stablePrefixIdentity,
        array $breakpoints,
        ?string $ttl,
        ?int $minimumInputTokens,
    ): self {
        $provider = self::boundedIdentity($provider, 'Prompt cache provider', 64);
        $model = self::boundedIdentity($model, 'Prompt cache model', 256);
        foreach ([
            'system' => $stableSystemIdentity,
            'tools' => $stableToolSchemaIdentity,
            'prefix' => $stablePrefixIdentity,
        ] as $name => $identity) {
            if (preg_match('/^[a-f0-9]{64}$/', $identity) !== 1) {
                throw new InvalidArgumentException("Prompt cache {$name} identity must be a lowercase SHA-256 digest.");
            }
        }

        $keyHash = hash('sha256', json_encode([
            'contract' => self::CONTRACT_VERSION,
            'provider' => strtolower($provider),
            'model' => $model,
            'system_identity' => $stableSystemIdentity,
            'tool_schema_identity' => $stableToolSchemaIdentity,
            'prefix_identity' => $stablePrefixIdentity,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));

        return new self($mode, $keyHash, $breakpoints, $ttl, $minimumInputTokens);
    }

    /** @return array{mode: string, key_hash: string, breakpoints: list<string>, ttl: ?string, minimum_input_tokens: ?int} */
    public function toAuditArray(): array
    {
        return [
            'mode' => $this->mode,
            'key_hash' => $this->keyHash,
            'breakpoints' => $this->breakpoints,
            'ttl' => $this->ttl,
            'minimum_input_tokens' => $this->minimumInputTokens,
        ];
    }

    private static function boundedIdentity(string $value, string $label, int $limit): string
    {
        $value = trim($value);
        if ($value === '' || strlen($value) > $limit || preg_match('//u', $value) !== 1) {
            throw new InvalidArgumentException("{$label} must be a non-empty bounded UTF-8 string.");
        }

        return $value;
    }
}
