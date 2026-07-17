<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_file_authority_grants', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id')->nullable();
            $table->foreign('talos_session_id', 'talos_file_grants_session_fk')
                ->references('id')->on('talos_sessions')->cascadeOnDelete();
            $table->string('scope', 32);
            $table->string('label', 255);
            $table->json('permissions');
            $table->string('status', 32)->default('active');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status'], 'talos_file_grants_owner_status_idx');
            $table->index(['user_id', 'talos_session_id', 'status'], 'talos_file_grants_session_status_idx');
            $table->index(['status', 'expires_at'], 'talos_file_grants_expiry_idx');
        });

        Schema::create('talos_file_authority_grant_files', function (Blueprint $table): void {
            $table->string('grant_id');
            $table->foreign('grant_id', 'talos_file_grant_files_grant_fk')
                ->references('id')->on('talos_file_authority_grants')->cascadeOnDelete();
            $table->string('file_id');
            $table->foreign('file_id', 'talos_file_grant_files_file_fk')
                ->references('id')->on('talos_files')->cascadeOnDelete();
            $table->string('checksum_snapshot', 64);
            $table->timestamps();

            $table->unique(['grant_id', 'file_id'], 'talos_file_grant_files_unique');
            $table->index(['file_id', 'grant_id'], 'talos_file_grant_files_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_file_authority_grant_files');
        Schema::dropIfExists('talos_file_authority_grants');
    }
};
