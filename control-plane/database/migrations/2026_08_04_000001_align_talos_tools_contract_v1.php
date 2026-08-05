<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_tools', function (Blueprint $table): void {
            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->unsignedBigInteger('contract_revision')->default(1);
            $table->json('output_schema')->nullable();
            $table->json('capabilities')->nullable();
            $table->json('actions')->nullable();
            $table->string('confirmation')->default('policy');
            $table->json('effects')->nullable();
            $table->string('lifecycle_kind')->default('managed_registry');
            $table->string('lifecycle_integrity_sha256', 64)->nullable();
            $table->json('execution_locations')->nullable();
            $table->string('implementation_key', 200)->nullable();
        });

        foreach (DB::table('talos_tools')->orderBy('id')->get() as $tool) {
            DB::table('talos_tools')->where('id', $tool->id)->update($this->backfill($tool));
        }
    }

    public function down(): void
    {
        foreach (DB::table('talos_tools')->orderBy('id')->get() as $tool) {
            if (! $this->isLosslessLegacyProjection($tool)) {
                throw new \RuntimeException('Cannot roll back Tool contract migration while canonical-only state exists.');
            }
        }

        Schema::table('talos_tools', function (Blueprint $table): void {
            $table->dropColumn([
                'schema_version',
                'contract_revision',
                'output_schema',
                'capabilities',
                'actions',
                'confirmation',
                'effects',
                'lifecycle_kind',
                'lifecycle_integrity_sha256',
                'execution_locations',
                'implementation_key',
            ]);
        });
    }

    /** @return array<string, mixed> */
    private function backfill(object $tool): array
    {
        $risk = is_string($tool->risk_level ?? null) ? $tool->risk_level : 'low';
        $capability = is_string($tool->capability ?? null) && trim($tool->capability) !== ''
            ? trim($tool->capability)
            : 'talos.tool.'.strtolower(str_replace('_', '.', (string) $tool->name));

        return [
            'schema_version' => 1,
            'contract_revision' => 1,
            'output_schema' => null,
            'capabilities' => $this->json([$capability]),
            'actions' => $this->json(['read', 'write', 'outbound']),
            'confirmation' => in_array($risk, ['high', 'critical'], true) ? 'always' : 'policy',
            'effects' => $this->json([
                'mutates_state' => true,
                'parallel_safe' => false,
                'requires_approval' => in_array($risk, ['high', 'critical'], true),
                'produces_evidence' => true,
            ]),
            'lifecycle_kind' => 'managed_registry',
            'lifecycle_integrity_sha256' => null,
            'execution_locations' => $this->json(['trusted_node']),
            'implementation_key' => 'registry.'.strtolower((string) $tool->name),
        ];
    }

    private function isLosslessLegacyProjection(object $tool): bool
    {
        $expected = $this->backfill($tool);
        foreach ($expected as $column => $value) {
            $actual = $tool->{$column} ?? null;
            if (in_array($column, ['capabilities', 'actions', 'effects', 'execution_locations'], true)) {
                if ($this->decodeJson($actual) !== $this->decodeJson($value)) {
                    return false;
                }
                continue;
            }
            if ($actual != $value) {
                return false;
            }
        }

        return $tool->output_schema === null && $tool->lifecycle_integrity_sha256 === null;
    }

    private function json(array $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }

    private function decodeJson(mixed $value): mixed
    {
        return is_string($value) ? json_decode($value, true, flags: JSON_THROW_ON_ERROR) : $value;
    }
};
