<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_tool_turns', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('session_id');
            $table->foreign('session_id')->references('id')->on('talos_sessions')->cascadeOnDelete();
            $table->string('run_id')->unique();
            $table->foreign('run_id')->references('id')->on('talos_runs')->cascadeOnDelete();
            $table->string('model_profile_id')->nullable();
            $table->foreign('model_profile_id')->references('id')->on('talos_model_profiles')->nullOnDelete();
            $table->string('status');
            $table->string('provider', 64);
            $table->string('model');
            $table->string('adapter_version', 128);
            $table->string('provider_response_id')->nullable();
            $table->string('continuation_kind', 64)->nullable();
            $table->json('pending_tool_call_ids');
            $table->longText('provider_state')->nullable();
            $table->string('provider_state_sha256', 71)->nullable();
            $table->json('budget_policy');
            $table->json('budget_usage');
            $table->unsignedInteger('revision')->default(0);
            $table->timestamp('cancel_requested_at')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status'], 'talos_tool_turns_owner_status_idx');
            $table->index(['session_id', 'created_at'], 'talos_tool_turns_session_created_idx');
        });

        Schema::create('talos_tool_calls', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('tool_turn_id');
            $table->foreign('tool_turn_id')->references('id')->on('talos_tool_turns')->cascadeOnDelete();
            $table->string('run_id');
            $table->foreign('run_id')->references('id')->on('talos_runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sequence');
            $table->string('logical_call_id');
            $table->string('provider_call_id');
            $table->string('node_id')->nullable();
            $table->string('tool_name', 128);
            $table->string('node_type', 128)->nullable();
            $table->json('arguments');
            $table->string('arguments_sha256', 71);
            $table->json('dependencies');
            $table->string('fingerprint', 71);
            $table->unsignedInteger('state_version')->nullable();
            $table->string('evidence_hash', 71)->nullable();
            $table->string('risk', 64);
            $table->string('capability', 128);
            $table->string('status', 64);
            $table->unsignedInteger('attempt')->default(0);
            $table->string('approval_state', 64)->default('not_required');
            $table->string('approval_id')->nullable()->unique();
            $table->string('approval_payload_sha256', 71)->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamps();

            $table->unique(['tool_turn_id', 'provider_call_id'], 'talos_tool_calls_provider_unique');
            $table->unique(['tool_turn_id', 'logical_call_id', 'attempt'], 'talos_tool_calls_attempt_unique');
            $table->unique(['tool_turn_id', 'sequence'], 'talos_tool_calls_sequence_unique');
            $table->index(['user_id', 'status'], 'talos_tool_calls_owner_status_idx');
            $table->index(['run_id', 'sequence'], 'talos_tool_calls_run_sequence_idx');
        });

        Schema::create('talos_tool_results', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('tool_call_id');
            $table->foreign('tool_call_id')->references('id')->on('talos_tool_calls')->cascadeOnDelete();
            $table->string('tool_turn_id');
            $table->foreign('tool_turn_id')->references('id')->on('talos_tool_turns')->cascadeOnDelete();
            $table->string('run_id');
            $table->foreign('run_id')->references('id')->on('talos_runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider_call_id');
            $table->unsignedInteger('attempt')->default(0);
            $table->string('status', 64);
            $table->boolean('is_error');
            $table->json('canonical_result');
            $table->string('error_code', 128)->nullable();
            $table->json('evidence_ids');
            $table->unsignedInteger('state_version')->nullable();
            $table->timestamps();

            $table->unique(['tool_call_id', 'attempt'], 'talos_tool_results_attempt_unique');
            $table->index(['user_id', 'run_id', 'provider_call_id'], 'talos_tool_results_correlation_idx');
        });

        Schema::create('talos_tool_budget_reservations', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('tool_turn_id');
            $table->foreign('tool_turn_id')->references('id')->on('talos_tool_turns')->cascadeOnDelete();
            $table->string('run_id');
            $table->foreign('run_id')->references('id')->on('talos_runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('tool_call_id')->nullable();
            $table->foreign('tool_call_id')->references('id')->on('talos_tool_calls')->nullOnDelete();
            $table->string('reservation_id')->unique();
            $table->string('kind', 64);
            $table->string('resource', 64);
            $table->unsignedBigInteger('reserved_amount');
            $table->unsignedBigInteger('settled_amount')->nullable();
            $table->string('status', 64);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['tool_turn_id', 'resource', 'status'], 'talos_tool_budget_turn_resource_idx');
            $table->index(['user_id', 'created_at'], 'talos_tool_budget_owner_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_tool_budget_reservations');
        Schema::dropIfExists('talos_tool_results');
        Schema::dropIfExists('talos_tool_calls');
        Schema::dropIfExists('talos_tool_turns');
    }
};
