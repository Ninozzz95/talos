<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_external_accounts', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('provider')->index();
            $table->string('provider_account_id')->nullable()->index();
            $table->string('email')->nullable();
            $table->string('display_name')->nullable();
            $table->text('encrypted_access_token')->nullable();
            $table->text('encrypted_refresh_token')->nullable();
            $table->json('scopes')->nullable();
            $table->string('status')->default('disconnected')->index();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('connected_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->text('last_error')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('talos_external_sync_states', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('external_account_id')->constrained('talos_external_accounts')->cascadeOnDelete();
            $table->string('provider')->index();
            $table->string('resource_type')->index();
            $table->string('resource_id')->nullable();
            $table->text('sync_cursor')->nullable();
            $table->string('status')->default('idle')->index();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_external_sync_states');
        Schema::dropIfExists('talos_external_accounts');
    }
};
