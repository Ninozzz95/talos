<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('browser_session_id');
            $table->string('artifact_id');
            $table->string('artifact_sha256', 72);
            $table->unsignedBigInteger('state_version');
            $table->decimal('normalized_x', 9, 6);
            $table->decimal('normalized_y', 9, 6);
            $table->string('button', 16);
            $table->unsignedTinyInteger('click_count');
            $table->string('target_fingerprint', 72);
            $table->string('category', 64);
            $table->string('status', 32)->default('pending');
            $table->string('payload_version', 96);
            $table->json('payload');
            $table->string('payload_hash', 72);
            $table->string('request_hash', 72);
            $table->timestamp('expires_at');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->foreign('browser_session_id')->references('id')->on('talos_browser_sessions')->cascadeOnDelete();
            $table->foreign('artifact_id')->references('id')->on('talos_browser_artifacts')->cascadeOnDelete();
            $table->index(['user_id', 'status', 'expires_at']);
            $table->index(['browser_session_id', 'status']);
            $table->index(['request_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_hmi_approvals');
    }
};
