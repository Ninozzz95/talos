<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use JsonException;
use stdClass;

final class ToolWireDecoder
{
    /** @return array<string, mixed> */
    public static function definition(string $json): array
    {
        $root = self::rootObject($json, 'Tool definition');
        self::jsonSchema(self::requiredObject($root, 'inputSchema', 'Tool definition'), 'Tool definition inputSchema');
        if (property_exists($root, 'outputSchema')) {
            self::jsonSchema(self::requiredObject($root, 'outputSchema', 'Tool definition'), 'Tool definition outputSchema');
        }
        foreach (['annotations', 'execution', '_meta'] as $field) {
            self::optionalObject($root, $field, 'Tool definition');
        }
        if (property_exists($root, 'icons')) {
            self::iconList(self::requiredList($root, 'icons', 'Tool definition'), 'Tool definition icons');
        }

        return self::objectToArray($root);
    }

    /** @return array<string, mixed> */
    public static function call(string $json): array
    {
        $root = self::rootObject($json, 'Provider tool call');
        self::requiredObject($root, 'arguments', 'Provider tool call');
        self::requiredObject($root, 'provider_metadata', 'Provider tool call');

        return self::objectToArray($root);
    }

    /** @return array<string, mixed> */
    public static function context(string $json): array
    {
        return self::objectToArray(self::rootObject($json, 'Tool execution context'));
    }

    /** @return array<string, mixed> */
    public static function result(string $json): array
    {
        $root = self::rootObject($json, 'Tool result');
        $content = self::requiredList($root, 'content', 'Tool result');
        foreach ($content as $index => $block) {
            if (! $block instanceof stdClass) {
                throw new InvalidArgumentException(sprintf('Tool result content item %d must be an object.', $index));
            }
            foreach (['annotations', '_meta'] as $field) {
                self::optionalObject($block, $field, sprintf('Tool result content item %d', $index));
            }
            if (property_exists($block, 'icons')) {
                self::iconList(self::requiredList($block, 'icons', sprintf('Tool result content item %d', $index)), sprintf('Tool result content item %d icons', $index));
            }
            if (property_exists($block, 'resource')) {
                $resource = self::requiredObject($block, 'resource', sprintf('Tool result content item %d', $index));
                self::optionalObject($resource, '_meta', sprintf('Tool result content item %d resource', $index));
            }
        }

        $evidence = self::requiredList($root, 'evidence', 'Tool result');
        foreach ($evidence as $index => $item) {
            if (! $item instanceof stdClass) {
                throw new InvalidArgumentException(sprintf('Tool result evidence item %d must be an object.', $index));
            }
        }

        if (property_exists($root, 'structuredContent') && $root->structuredContent !== null) {
            $structured = self::requiredObject($root, 'structuredContent', 'Tool result');
            if (property_exists($structured, 'evidence_ids')) {
                self::requiredList($structured, 'evidence_ids', 'Tool result structuredContent');
            }
        }

        return self::objectToArray($root);
    }

    private static function rootObject(string $json, string $label): stdClass
    {
        try {
            $decoded = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException(sprintf('%s JSON is malformed.', $label), previous: $exception);
        }
        if (! $decoded instanceof stdClass) {
            throw new InvalidArgumentException(sprintf('%s JSON root must be an object.', $label));
        }

        return $decoded;
    }

    private static function requiredObject(stdClass $parent, string $field, string $label): stdClass
    {
        if (! property_exists($parent, $field) || ! $parent->{$field} instanceof stdClass) {
            throw new InvalidArgumentException(sprintf('%s %s must be an object.', $label, $field));
        }

        return $parent->{$field};
    }

    private static function optionalObject(stdClass $parent, string $field, string $label): void
    {
        if (property_exists($parent, $field) && ! $parent->{$field} instanceof stdClass) {
            throw new InvalidArgumentException(sprintf('%s %s must be an object.', $label, $field));
        }
    }

    /** @return list<mixed> */
    private static function requiredList(stdClass $parent, string $field, string $label): array
    {
        if (! property_exists($parent, $field) || ! is_array($parent->{$field})) {
            throw new InvalidArgumentException(sprintf('%s %s must be a list.', $label, $field));
        }

        return $parent->{$field};
    }

    private static function jsonSchema(stdClass $schema, string $label): void
    {
        foreach (['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'] as $field) {
            if (! property_exists($schema, $field)) {
                continue;
            }
            $map = self::requiredObject($schema, $field, $label);
            foreach (get_object_vars($map) as $name => $child) {
                if ($child instanceof stdClass) {
                    self::jsonSchema($child, sprintf('%s %s.%s', $label, $field, $name));
                } elseif (! is_bool($child)) {
                    throw new InvalidArgumentException(sprintf('%s %s.%s must be a schema object or boolean.', $label, $field, $name));
                }
            }
        }

        foreach (['required', 'enum', 'examples', 'allOf', 'anyOf', 'oneOf', 'prefixItems'] as $field) {
            if (! property_exists($schema, $field)) {
                continue;
            }
            $items = self::requiredList($schema, $field, $label);
            if (in_array($field, ['allOf', 'anyOf', 'oneOf', 'prefixItems'], true)) {
                foreach ($items as $index => $child) {
                    if ($child instanceof stdClass) {
                        self::jsonSchema($child, sprintf('%s %s.%d', $label, $field, $index));
                    } elseif (! is_bool($child)) {
                        throw new InvalidArgumentException(sprintf('%s %s item %d must be a schema object or boolean.', $label, $field, $index));
                    }
                }
            }
        }

        foreach (['items', 'contains', 'not', 'if', 'then', 'else', 'propertyNames'] as $field) {
            if (! property_exists($schema, $field)) {
                continue;
            }
            $child = $schema->{$field};
            if ($child instanceof stdClass) {
                self::jsonSchema($child, sprintf('%s %s', $label, $field));
            } elseif (! is_bool($child)) {
                throw new InvalidArgumentException(sprintf('%s %s must be a schema object or boolean.', $label, $field));
            }
        }
    }

    /** @param list<mixed> $icons */
    private static function iconList(array $icons, string $label): void
    {
        foreach ($icons as $index => $icon) {
            if (! $icon instanceof stdClass) {
                throw new InvalidArgumentException(sprintf('%s item %d must be an object.', $label, $index));
            }
            if (property_exists($icon, 'sizes')) {
                self::requiredList($icon, 'sizes', sprintf('%s item %d', $label, $index));
            }
        }
    }

    /** @return array<string, mixed> */
    private static function objectToArray(stdClass $value): array
    {
        /** @var array<string, mixed> $converted */
        $converted = self::toPhpValue($value);

        return $converted;
    }

    private static function toPhpValue(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            return array_map(self::toPhpValue(...), get_object_vars($value));
        }
        if (is_array($value)) {
            return array_map(self::toPhpValue(...), $value);
        }

        return $value;
    }
}
