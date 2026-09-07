<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

use JsonException;
use Opis\JsonSchema\CompliantValidator;
use Opis\JsonSchema\Errors\ErrorFormatter;
use stdClass;

final class AlignmentContractDecoder
{
    /** @var array<string, stdClass> */
    private static array $schemas = [];

    private static ?CompliantValidator $validator = null;

    /** @return array<string, mixed> */
    public static function decode(string $json, AlignmentContractName $name): array
    {
        try {
            $decoded = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new AlignmentContractException('malformed_json', $name, 'JSON is malformed.', $exception);
        }

        if (! $decoded instanceof stdClass) {
            throw new AlignmentContractException('root_not_object', $name, 'JSON root must be an object.');
        }

        $result = self::validator()->validate($decoded, self::schema($name));
        if (! $result->isValid()) {
            $details = 'Does not satisfy the canonical schema.';
            if ($result->error() !== null) {
                $formatted = trim((new ErrorFormatter)->formatErrorMessage($result->error()));
                if ($formatted !== '') {
                    $details .= ' '.$formatted;
                }
            }

            throw new AlignmentContractException('schema_invalid', $name, $details);
        }

        /** @var array<string, mixed> $value */
        $value = self::toPhpValue($decoded);

        return $value;
    }

    /** @param array<string, mixed> $value */
    public static function encodeServerArray(array $value, AlignmentContractName $name): string
    {
        try {
            return json_encode(
                self::toWireValue($value, '', self::objectPaths($name), true),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            );
        } catch (JsonException $exception) {
            throw new AlignmentContractException(
                'server_value_not_json',
                $name,
                'Server-owned value contains data that cannot be encoded as JSON.',
                $exception,
            );
        }
    }

    private static function validator(): CompliantValidator
    {
        return self::$validator ??= new CompliantValidator;
    }

    private static function schema(AlignmentContractName $name): stdClass
    {
        if (isset(self::$schemas[$name->value])) {
            return self::$schemas[$name->value];
        }

        $path = dirname(__DIR__, 3).'/resources/schema/alignment/v1/'.$name->schemaFile();
        $contents = file_get_contents($path);
        if (! is_string($contents)) {
            throw new AlignmentContractException('schema_unavailable', $name, 'Canonical schema is unavailable.');
        }

        try {
            $schema = json_decode($contents, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new AlignmentContractException('schema_malformed', $name, 'Canonical schema is malformed.', $exception);
        }
        if (! $schema instanceof stdClass) {
            throw new AlignmentContractException('schema_malformed', $name, 'Canonical schema root must be an object.');
        }

        return self::$schemas[$name->value] = $schema;
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

    /**
     * @param list<string> $objectPaths
     */
    private static function toWireValue(mixed $value, string $path, array $objectPaths, bool $root = false): mixed
    {
        if ($value instanceof stdClass) {
            $mapped = [];
            foreach (get_object_vars($value) as $key => $item) {
                $childPath = $path === '' ? $key : $path.'.'.$key;
                $mapped[$key] = self::toWireValue($item, $childPath, $objectPaths);
            }

            return (object) $mapped;
        }
        if (! is_array($value)) {
            return $value;
        }

        if (! $root && array_is_list($value) && ! self::isObjectPath($path, $objectPaths)) {
            return array_map(
                static fn (mixed $item): mixed => self::toWireValue(
                    $item,
                    $path === '' ? '*' : $path.'.*',
                    $objectPaths,
                ),
                $value,
            );
        }

        $mapped = [];
        foreach ($value as $key => $item) {
            $childPath = $path === '' ? (string) $key : $path.'.'.$key;
            $mapped[$key] = self::toWireValue($item, $childPath, $objectPaths);
        }

        return (object) $mapped;
    }

    /** @param list<string> $objectPaths */
    private static function isObjectPath(string $path, array $objectPaths): bool
    {
        $segments = explode('.', $path);
        foreach ($objectPaths as $candidate) {
            $candidateSegments = explode('.', $candidate);
            if (count($segments) !== count($candidateSegments)) {
                continue;
            }

            $matches = true;
            foreach ($candidateSegments as $index => $segment) {
                if ($segment !== '*' && $segment !== $segments[$index]) {
                    $matches = false;
                    break;
                }
            }
            if ($matches) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    private static function objectPaths(AlignmentContractName $name): array
    {
        return match ($name) {
            AlignmentContractName::ToolDefinition => [
                'input_schema',
                'input_schema.properties',
                'output_schema',
                'output_schema.properties',
                'effects',
                'lifecycle',
                'execution',
                'annotations',
                'metadata',
            ],
            AlignmentContractName::CapabilityPolicySet => ['policies.*', 'grants.*'],
            AlignmentContractName::ModelCatalogEntry => [
                'source',
                'files.*',
                'runtimes.*',
                'requirements',
            ],
            AlignmentContractName::ModelTransfer => [],
            AlignmentContractName::FileAuthorityGrant => ['resource_bindings.*'],
            AlignmentContractName::LibraryItem => [
                'source',
                'content',
                'provenance',
                'provenance.activity',
                'provenance.agent',
                'provenance.derived_from.*',
                'provenance.content_credentials',
                'relationships',
                'relationships.backlinks.*',
                'capabilities',
                'metadata',
            ],
        };
    }
}
