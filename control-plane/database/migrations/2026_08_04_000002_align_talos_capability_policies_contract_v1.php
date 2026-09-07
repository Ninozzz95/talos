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
        Schema::table('talos_capability_policies', function (Blueprint $table): void {
            $table->json('actions')->nullable();
            $table->string('source', 16)->nullable();
            $table->string('legacy_decision', 32)->nullable();
            $table->string('legacy_talos_session_id')->nullable();
            $table->timestamp('legacy_expires_at')->nullable();
            $table->timestamp('canonicalized_at')->nullable();
        });

        Schema::create('talos_capability_grants', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('policy_set_id');
            $table->foreign('policy_set_id', 'talos_capability_grant_set_fk')
                ->references('id')->on('talos_capability_policy_sets')->cascadeOnDelete();
            $table->string('capability', 64);
            $table->string('tool_id', 128)->nullable();
            $table->json('actions');
            $table->string('scope', 16);
            $table->string('scope_id', 128)->nullable();
            $table->string('status', 16);
            $table->timestamp('granted_at');
            $table->timestamp('expires_at')->nullable();
            $table->boolean('risk_acknowledged')->default(false);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->uuid('legacy_policy_id')->nullable()->unique('talos_capability_grant_legacy_unique');
            $table->timestamps();

            $table->index(
                ['policy_set_id', 'capability', 'status'],
                'talos_capability_grant_lookup_idx',
            );
            $table->index(
                ['scope', 'scope_id', 'status'],
                'talos_capability_grant_scope_idx',
            );
            $table->index(
                ['status', 'expires_at'],
                'talos_capability_grant_expiry_idx',
            );
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('talos_capability_grants')
            && DB::table('talos_capability_grants')->exists()) {
            throw new \RuntimeException('Refusing to remove TALOS capability grant history.');
        }

        if (DB::table('talos_capability_policies')
            ->where(function ($query): void {
                $query->whereNotNull('canonicalized_at')
                    ->orWhereNotNull('source')
                    ->orWhere('decision', 'allow');
            })->exists()) {
            throw new \RuntimeException('Refusing to remove canonical-only capability policy state.');
        }

        Schema::dropIfExists('talos_capability_grants');
        Schema::table('talos_capability_policies', function (Blueprint $table): void {
            $table->dropColumn([
                'actions',
                'source',
                'legacy_decision',
                'legacy_talos_session_id',
                'legacy_expires_at',
                'canonicalized_at',
            ]);
        });
    }
};
