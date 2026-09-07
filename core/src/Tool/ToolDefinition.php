<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use Kadmos\Alignment\Contract\ToolDefinitionV1;

final readonly class ToolDefinition implements \JsonSerializable
{
    /**
     * @param array<string, mixed> $inputSchema
     * @param array<string, mixed>|null $outputSchema
     * @param array<string, mixed> $annotations
     * @param list<array<string, mixed>> $icons
     * @param array<string, mixed>|null $execution
     * @param array<string, mixed> $meta
     * @param array<string, mixed> $serialized
     */
    private function __construct(
        public string $name,
        public ?string $title,
        public ?string $description,
        public array $inputSchema,
        public ?array $outputSchema,
        public array $annotations,
        public array $icons,
        public ?array $execution,
        public array $meta,
        private array $serialized,
    ) {}

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        ToolContractGuard::exactKeys(
            $value,
            ['name', 'inputSchema'],
            ['title', 'description', 'outputSchema', 'annotations', 'icons', 'execution', '_meta'],
            'Tool definition',
        );

        $name = ToolContractGuard::nonEmptyString($value['name'], 'Tool definition name', 128);
        if (preg_match('/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,126}[A-Za-z0-9])?$/D', $name) !== 1) {
            throw new InvalidArgumentException('Tool definition name contains unsupported characters.');
        }

        $title = array_key_exists('title', $value)
            ? ToolContractGuard::boundedString($value['title'], 'Tool definition title', 256)
            : null;
        $description = array_key_exists('description', $value)
            ? ToolContractGuard::boundedString($value['description'], 'Tool definition description', 4096)
            : null;
        $inputSchema = self::objectSchema($value['inputSchema'], 'Tool definition inputSchema');
        $outputSchema = array_key_exists('outputSchema', $value)
            ? self::objectSchema($value['outputSchema'], 'Tool definition outputSchema')
            : null;
        $annotations = array_key_exists('annotations', $value)
            ? self::annotations($value['annotations'])
            : [];
        $icons = array_key_exists('icons', $value) ? self::icons($value['icons']) : [];
        $execution = array_key_exists('execution', $value) ? self::execution($value['execution']) : null;
        $meta = array_key_exists('_meta', $value)
            ? ToolContractGuard::objectArray($value['_meta'], 'Tool definition _meta')
            : [];
        ToolContractGuard::jsonValue($meta, 'Tool definition _meta');

        return new self($name, $title, $description, $inputSchema, $outputSchema, $annotations, $icons, $execution, $meta, $value);
    }

    public static function fromJson(string $json): self
    {
        return self::fromArray(ToolWireDecoder::definition($json));
    }

    /** @param array<string, mixed> $value */
    public static function fromStrictArray(array $value): self
    {
        $definition = self::fromArray($value);
        self::assertClosedSchema($definition->inputSchema, 'Tool definition inputSchema');
        if ($definition->outputSchema !== null) {
            self::assertClosedSchema($definition->outputSchema, 'Tool definition outputSchema');
        }

        return $definition;
    }

    public static function fromStrictJson(string $json): self
    {
        return self::fromStrictArray(ToolWireDecoder::definition($json));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->serialized;
    }

    /** @return array<string, mixed> */
    public function toWireArray(): array
    {
        $serialized = $this->serialized;
        foreach (['annotations', 'execution', '_meta'] as $field) {
            if (array_key_exists($field, $serialized) && is_array($serialized[$field])) {
                $serialized[$field] = ToolContractGuard::canonicalObjectArray($serialized[$field]);
            }
        }
        foreach (['inputSchema', 'outputSchema'] as $schemaField) {
            if (is_array($serialized[$schemaField] ?? null)
                && array_key_exists('properties', $serialized[$schemaField])
                && is_array($serialized[$schemaField]['properties'])) {
                $serialized[$schemaField]['properties'] = ToolContractGuard::canonicalObjectArray($serialized[$schemaField]['properties']);
            }
        }

        return $serialized;
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return $this->toWireArray();
    }

    /**
     * @param non-empty-list<'local_mobile'|'trusted_node'|'remote_provider'> $locations
     */
    public function toAlignmentContractV1(
        ProceduralToolSpec $spec,
        string $id,
        string $revision,
        array $locations,
    ): ToolDefinitionV1 {
        return ToolDefinitionV1::fromArray([
            'schema_version' => ToolDefinitionV1::SCHEMA_VERSION,
            'id' => $id,
            'name' => $spec->nodeType,
            'title' => $this->title ?? $this->name,
            'description' => $this->description ?? ($this->title ?? $this->name),
            'input_schema' => $this->inputSchema,
            'output_schema' => $this->outputSchema,
            'capabilities' => [$spec->capability],
            'actions' => $spec->actions,
            'confirmation' => $spec->confirmation,
            'risk' => $spec->risk,
            'effects' => $spec->effects(),
            'lifecycle' => [
                'kind' => 'bundled',
                'revision' => $revision,
            ],
            'execution' => [
                'locations' => $locations,
                'implementation_key' => $spec->toolName,
            ],
            'connector_id' => null,
            'enabled' => true,
            'planning_enabled' => true,
            'annotations' => $this->annotations,
            'metadata' => [
                'mcp_name' => $this->name,
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private static function objectSchema(mixed $value, string $label): array
    {
        $schema = ToolContractGuard::objectArray($value, $label);
        if (($schema['type'] ?? null) !== 'object') {
            throw new InvalidArgumentException(sprintf('%s type must be object.', $label));
        }

        if (array_key_exists('properties', $schema)) {
            ToolContractGuard::objectArray($schema['properties'], $label.'.properties');
        }
        if (array_key_exists('required', $schema)) {
            $required = ToolContractGuard::boundedListArray($schema['required'], $label.'.required', 256);
            $seen = [];
            foreach ($required as $field) {
                $field = ToolContractGuard::nonEmptyString($field, $label.'.required field', 256);
                if (isset($seen[$field])) {
                    throw new InvalidArgumentException(sprintf('%s required fields must be unique.', $label));
                }
                $seen[$field] = true;
            }
        }

        ToolContractGuard::jsonValue($schema, $label);

        return $schema;
    }

    /** @param array<string, mixed> $schema */
    private static function assertClosedSchema(array $schema, string $label): void
    {
        if (($schema['additionalProperties'] ?? null) !== false) {
            throw new InvalidArgumentException(sprintf('%s must set additionalProperties to false for procedural execution.', $label));
        }

        $properties = array_key_exists('properties', $schema)
            ? ToolContractGuard::objectArray($schema['properties'], $label.'.properties')
            : [];
        foreach (array_key_exists('required', $schema) ? ToolContractGuard::listArray($schema['required'], $label.'.required') : [] as $field) {
            if (! is_string($field) || ! array_key_exists($field, $properties)) {
                throw new InvalidArgumentException(sprintf('%s must declare every required procedural argument in properties.', $label));
            }
        }
    }

    /** @return array<string, mixed> */
    private static function annotations(mixed $value): array
    {
        $annotations = ToolContractGuard::objectArray($value, 'Tool definition annotations');
        ToolContractGuard::exactKeys(
            $annotations,
            [],
            ['title', 'readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'],
            'Tool definition annotations',
        );

        foreach ($annotations as $name => $annotation) {
            if ($name === 'title') {
                ToolContractGuard::boundedString($annotation, 'Tool definition annotation title', 256);
                continue;
            }
            ToolContractGuard::boolean($annotation, 'Tool definition annotation '.$name);
        }

        return $annotations;
    }

    /** @return list<array<string, mixed>> */
    private static function icons(mixed $value): array
    {
        return ToolContractGuard::mcpIconList($value, 'Tool definition icons', 16);
    }

    /** @return array<string, mixed> */
    private static function execution(mixed $value): array
    {
        $execution = ToolContractGuard::objectArray($value, 'Tool definition execution');
        ToolContractGuard::exactKeys($execution, [], ['taskSupport'], 'Tool definition execution');
        if (array_key_exists('taskSupport', $execution)
            && (! is_string($execution['taskSupport']) || ! in_array($execution['taskSupport'], ['forbidden', 'optional', 'required'], true))) {
            throw new InvalidArgumentException('Tool definition execution taskSupport is unsupported.');
        }

        return $execution;
    }
}
