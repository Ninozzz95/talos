<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_capability_policy_sets', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->unsignedBigInteger('revision')->default(0);
            $table->timestamps();
        });

        Schema::create('talos_capability_policies', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('policy_set_id');
            $table->foreign('policy_set_id', 'talos_capability_policy_set_fk')
                ->references('id')->on('talos_capability_policy_sets')->cascadeOnDelete();
            $table->string('capability', 64);
            $table->string('decision', 32);
            $table->string('talos_session_id')->nullable();
            $table->foreign('talos_session_id', 'talos_capability_policy_session_fk')
                ->references('id')->on('talos_sessions')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->unique(['policy_set_id', 'capability'], 'talos_capability_policy_unique');
            $table->index(['decision', 'expires_at'], 'talos_capability_policy_expiry_idx');
            $table->index(['talos_session_id', 'decision'], 'talos_capability_policy_session_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_capability_policies');
        Schema::dropIfExists('talos_capability_policy_sets');
    }
};
