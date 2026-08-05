<?php

declare(strict_types=1);

namespace App\Services\Tools;

use App\Models\TalosTool;
use Kadmos\Alignment\Contract\ToolDefinitionV1;

final class TalosToolContractMapper
{
    /** @param array<string, mixed> $payload */
    public static function fromLegacyWrite(array $payload, string $id, int $revision): ToolDefinitionV1
    {
        $name = (string) ($payload['name'] ?? '');
        $title = (string) ($payload['display_name'] ?? '');
        $description = trim((string) ($payload['description'] ?? ''));
        $risk = (string) ($payload['risk_level'] ?? 'low');
        $capability = trim((string) ($payload['capability'] ?? ''));
        $capabilities = $payload['capabilities'] ?? ($capability !== ''
            ? [$capability]
            : ['talos.tool.'.strtolower(str_replace('_', '.', $name))]);
        $effects = $payload['effects'] ?? self::conservativeEffects($risk);
        $execution = $payload['execution'] ?? [
            'locations' => ['trusted_node'],
            'implementation_key' => 'registry.'.strtolower($name),
        ];

        return ToolDefinitionV1::fromArray([
            'schema_version' => (int) ($payload['schema_version'] ?? ToolDefinitionV1::SCHEMA_VERSION),
            'id' => $id,
            'name' => $name,
            'title' => $title,
            'description' => $description !== '' ? $description : $title,
            'input_schema' => $payload['input_schema'] ?? [],
            'output_schema' => $payload['output_schema'] ?? null,
            'capabilities' => $capabilities,
            'actions' => $payload['actions'] ?? ['read', 'write', 'outbound'],
            'confirmation' => $payload['confirmation'] ?? (in_array($risk, ['high', 'critical'], true) ? 'always' : 'policy'),
            'risk' => $risk,
            'effects' => $effects,
            'lifecycle' => [
                'kind' => 'managed_registry',
                'revision' => 'managed-registry:'.$revision,
                ...self::integrityMember($payload['lifecycle_integrity_sha256'] ?? null),
            ],
            'execution' => $execution,
            'connector_id' => $payload['connector_id'] ?? null,
            'enabled' => (bool) ($payload['is_enabled'] ?? true),
            'planning_enabled' => (bool) ($payload['planning_enabled'] ?? true),
            'annotations' => [],
            'metadata' => [],
        ]);
    }

    public static function fromModel(TalosTool $tool): ToolDefinitionV1
    {
        return ToolDefinitionV1::fromArray([
            'schema_version' => (int) $tool->schema_version,
            'id' => (string) $tool->id,
            'name' => (string) $tool->name,
            'title' => (string) $tool->display_name,
            'description' => trim((string) $tool->description) !== '' ? (string) $tool->description : (string) $tool->display_name,
            'input_schema' => $tool->input_schema ?? [],
            'output_schema' => $tool->output_schema,
            'capabilities' => $tool->capabilities ?? [],
            'actions' => $tool->actions ?? [],
            'confirmation' => (string) $tool->confirmation,
            'risk' => (string) $tool->risk_level,
            'effects' => $tool->effects ?? [],
            'lifecycle' => [
                'kind' => (string) $tool->lifecycle_kind,
                'revision' => ((string) $tool->lifecycle_kind === 'managed_registry' ? 'managed-registry:' : 'bundled:').(int) $tool->contract_revision,
                ...self::integrityMember($tool->lifecycle_integrity_sha256),
            ],
            'execution' => [
                'locations' => $tool->execution_locations ?? [],
                'implementation_key' => (string) $tool->implementation_key,
            ],
            'connector_id' => $tool->connector_id,
            'enabled' => (bool) $tool->is_enabled,
            'planning_enabled' => (bool) $tool->planning_enabled,
            'annotations' => [],
            'metadata' => [],
        ]);
    }

    /**
     * @param array<string, mixed> $legacy
     * @return array<string, mixed>
     */
    public static function persistenceAttributes(ToolDefinitionV1 $contract, array $legacy): array
    {
        $value = $contract->toArray();
        $revision = self::revisionNumber((string) $value['lifecycle']['revision']);

        return [
            'id' => $value['id'],
            'connector_id' => $value['connector_id'],
            'name' => $value['name'],
            'display_name' => $value['title'],
            'description' => $value['description'],
            'input_schema' => $value['input_schema'],
            'output_schema' => $value['output_schema'],
            'risk_level' => $value['risk'],
            'capability' => $legacy['capability'] ?? $value['capabilities'][0],
            'capabilities' => $value['capabilities'],
            'actions' => $value['actions'],
            'confirmation' => $value['confirmation'] ?? 'policy',
            'effects' => $value['effects'],
            'lifecycle_kind' => $value['lifecycle']['kind'],
            'lifecycle_integrity_sha256' => $value['lifecycle']['integrity_sha256'] ?? null,
            'execution_locations' => $value['execution']['locations'],
            'implementation_key' => $value['execution']['implementation_key'],
            'schema_version' => $value['schema_version'],
            'contract_revision' => $revision,
            'policy' => $legacy['policy'] ?? null,
            'is_enabled' => $value['enabled'],
            'planning_enabled' => $value['planning_enabled'],
        ];
    }

    /** @return array{available: bool, reason: ?string} */
    public static function desktopAvailability(ToolDefinitionV1 $contract): array
    {
        $value = $contract->toArray();
        if ($value['enabled'] !== true) {
            return ['available' => false, 'reason' => 'tool_disabled'];
        }
        if ($value['planning_enabled'] !== true) {
            return ['available' => false, 'reason' => 'planning_disabled'];
        }
        if (array_intersect($value['execution']['locations'], ['trusted_node', 'remote_provider']) === []) {
            return ['available' => false, 'reason' => 'desktop_location_unsupported'];
        }

        return ['available' => true, 'reason' => null];
    }

    /**
     * @param array<string, mixed> $legacy
     * @param array<string, mixed>|null $connector
     * @return array<string, mixed>
     */
    public static function apiEnvelope(ToolDefinitionV1 $contract, array $legacy, ?array $connector = null): array
    {
        $availability = self::desktopAvailability($contract);
        if ($availability['available'] && $connector !== null && ($connector['is_enabled'] ?? false) !== true) {
            $availability = ['available' => false, 'reason' => 'connector_disabled'];
        }
        if ($availability['available'] && $connector !== null && ($connector['health_status'] ?? null) !== 'healthy') {
            $availability = ['available' => false, 'reason' => 'connector_unhealthy'];
        }

        return [
            ...$legacy,
            'contract' => $contract->toArray(),
            'availability' => $availability,
            ...($connector !== null ? ['connector' => $connector] : []),
        ];
    }

    /** @return array<string, mixed> */
    public static function bundledApiEnvelope(string $toolName, ToolDefinitionV1 $contract): array
    {
        $value = $contract->toArray();

        return self::apiEnvelope($contract, [
            'id' => $value['id'],
            'connector_id' => null,
            'name' => $toolName,
            'display_name' => $value['title'],
            'description' => $value['description'],
            'input_schema' => $value['input_schema'],
            'risk_level' => $value['risk'],
            'capability' => $value['capabilities'][0],
            'policy' => [],
            'is_enabled' => $value['enabled'],
            'planning_enabled' => $value['planning_enabled'],
            'created_at' => null,
            'updated_at' => null,
        ]);
    }

    /** @return array{mutates_state: bool, parallel_safe: false, requires_approval: bool, produces_evidence: true} */
    private static function conservativeEffects(string $risk): array
    {
        return [
            'mutates_state' => true,
            'parallel_safe' => false,
            'requires_approval' => in_array($risk, ['high', 'critical'], true),
            'produces_evidence' => true,
        ];
    }

    /** @return array<string, string|null> */
    private static function integrityMember(mixed $integrity): array
    {
        return $integrity === null || $integrity === '' ? [] : ['integrity_sha256' => (string) $integrity];
    }

    private static function revisionNumber(string $revision): int
    {
        $separator = strrpos($revision, ':');
        $value = $separator === false ? '' : substr($revision, $separator + 1);

        return ctype_digit($value) && (int) $value > 0 ? (int) $value : 1;
    }
}
