<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use JsonException;
use Kadmos\Tool\ToolCall;
use Opis\JsonSchema\CompliantValidator;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Errors\ValidationError;
use Opis\JsonSchema\JsonPointer;
use stdClass;

final class TalosProviderToolArgumentValidator
{
    private readonly CompliantValidator $validator;

    private readonly ErrorFormatter $formatter;

    public function __construct(?CompliantValidator $validator = null, ?ErrorFormatter $formatter = null)
    {
        $this->validator = $validator ?? new CompliantValidator;
        $this->formatter = $formatter ?? new ErrorFormatter;
    }

    public function validate(ToolCall $call): ?TalosToolArgumentValidationFault
    {
        $definition = TalosProceduralToolRegistry::definitions()[$call->name] ?? null;
        if ($definition === null) {
            return new TalosToolArgumentValidationFault(
                $call->providerCallId,
                $call->name,
                '/',
                'tool_name',
                'The tool name is not present in the server-owned TALOS registry.',
            );
        }

        try {
            $wireSchema = $definition->toWireArray()['inputSchema'];
            $schema = json_decode(
                json_encode($wireSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                false,
                512,
                JSON_THROW_ON_ERROR,
            );
        } catch (JsonException) {
            return new TalosToolArgumentValidationFault(
                $call->providerCallId,
                $call->name,
                '/',
                'server_schema',
                'The server-owned tool schema could not be loaded.',
            );
        }

        $result = $this->validator->validate(
            $this->toSchemaValue($call->arguments, $definition->inputSchema),
            $schema,
        );
        if ($result->isValid()) {
            return null;
        }

        $error = $result->error();
        if (! $error instanceof ValidationError) {
            return new TalosToolArgumentValidationFault(
                $call->providerCallId,
                $call->name,
                '/',
                'validation',
                'The provider arguments did not satisfy the server-owned schema.',
            );
        }
        $error = $this->firstLeaf($error);

        return new TalosToolArgumentValidationFault(
            $call->providerCallId,
            $call->name,
            $this->path($error),
            $error->keyword() !== '' ? $error->keyword() : 'validation',
            $this->boundedMessage($this->formatter->formatErrorMessage($error)),
        );
    }

    /** @param array<string, mixed> $schema */
    private function toSchemaValue(mixed $value, array $schema): mixed
    {
        if ($this->allowsType($schema, 'object')) {
            if (! is_array($value) || ($value !== [] && array_is_list($value))) {
                return $value;
            }

            $properties = is_array($schema['properties'] ?? null) ? $schema['properties'] : [];
            $object = new stdClass;
            foreach ($value as $key => $item) {
                $childSchema = is_string($key) && is_array($properties[$key] ?? null)
                    ? $properties[$key]
                    : [];
                $object->{$key} = $this->toSchemaValue($item, $childSchema);
            }

            return $object;
        }

        if ($this->allowsType($schema, 'array') && is_array($value) && array_is_list($value)) {
            $itemSchema = is_array($schema['items'] ?? null) ? $schema['items'] : [];

            return array_map(fn (mixed $item): mixed => $this->toSchemaValue($item, $itemSchema), $value);
        }

        if (is_array($value)) {
            if ($value === [] || array_is_list($value)) {
                return array_map(fn (mixed $item): mixed => $this->toSchemaValue($item, []), $value);
            }
            $object = new stdClass;
            foreach ($value as $key => $item) {
                $object->{$key} = $this->toSchemaValue($item, []);
            }

            return $object;
        }

        return $value;
    }

    /** @param array<string, mixed> $schema */
    private function allowsType(array $schema, string $expected): bool
    {
        $type = $schema['type'] ?? null;

        return $type === $expected || (is_array($type) && in_array($expected, $type, true));
    }

    private function firstLeaf(ValidationError $error): ValidationError
    {
        while ($error->subErrors() !== []) {
            $error = $error->subErrors()[0];
        }

        return $error;
    }

    private function path(ValidationError $error): string
    {
        $path = JsonPointer::pathToString($error->data()->fullPath());

        return $path !== '' ? $path : '/';
    }

    private function boundedMessage(string $message): string
    {
        $message = trim($message);
        if ($message === '') {
            return 'The provider arguments did not satisfy the server-owned schema.';
        }

        return strlen($message) <= 512 ? $message : substr($message, 0, 509).'...';
    }
}
