<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ToolCall implements \JsonSerializable
{
    public const SCHEMA_VERSION = 'talos_provider_tool_call_v1';

    /**
     * @param array<string, mixed> $arguments
     * @param array<string, mixed> $providerMetadata
     */
    public function __construct(
        public string $providerCallId,
        public string $name,
        public array $arguments,
        public ?string $assistantPreamble,
        public array $providerMetadata,
    ) {
        ToolContractGuard::nonEmptyString($providerCallId, 'Provider tool call ID', 256);
        ToolContractGuard::nonEmptyString($name, 'Provider tool name', 128);
        ToolContractGuard::objectArray($arguments, 'Provider tool arguments');
        ToolContractGuard::nullableString($assistantPreamble, 'Provider assistant preamble', 8192);
        ToolContractGuard::objectArray($providerMetadata, 'Provider tool metadata');
        ToolContractGuard::jsonValue($arguments, 'Provider tool arguments');
        ToolContractGuard::jsonValue($providerMetadata, 'Provider tool metadata');
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        ToolContractGuard::exactKeys(
            $value,
            ['schema_version', 'provider_call_id', 'name', 'arguments', 'assistant_preamble', 'provider_metadata'],
            [],
            'Provider tool call',
        );
        if (($value['schema_version'] ?? null) !== self::SCHEMA_VERSION) {
            throw new InvalidArgumentException('Provider tool call schema_version is unsupported.');
        }

        return new self(
            providerCallId: ToolContractGuard::nonEmptyString($value['provider_call_id'], 'Provider tool call ID', 256),
            name: ToolContractGuard::nonEmptyString($value['name'], 'Provider tool name', 128),
            arguments: ToolContractGuard::objectArray($value['arguments'], 'Provider tool arguments'),
            assistantPreamble: ToolContractGuard::nullableString($value['assistant_preamble'], 'Provider assistant preamble', 8192),
            providerMetadata: ToolContractGuard::objectArray($value['provider_metadata'], 'Provider tool metadata'),
        );
    }

    public static function fromJson(string $json): self
    {
        return self::fromArray(ToolWireDecoder::call($json));
    }

    /** @return list<string> */
    public static function allowedKeys(): array
    {
        return ['schema_version', 'provider_call_id', 'name', 'arguments', 'assistant_preamble', 'provider_metadata'];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'provider_call_id' => $this->providerCallId,
            'name' => $this->name,
            'arguments' => $this->arguments,
            'assistant_preamble' => $this->assistantPreamble,
            'provider_metadata' => $this->providerMetadata,
        ];
    }

    /** @return array<string, mixed> */
    public function toWireArray(): array
    {
        return [
            ...$this->toArray(),
            'arguments' => ToolContractGuard::canonicalObjectArray($this->arguments),
            'provider_metadata' => ToolContractGuard::canonicalObjectArray($this->providerMetadata),
        ];
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return $this->toWireArray();
    }

    /** @return array<string, mixed> */
    public function toRedactedArray(): array
    {
        return ToolContractGuard::redact($this->toWireArray());
    }
}
