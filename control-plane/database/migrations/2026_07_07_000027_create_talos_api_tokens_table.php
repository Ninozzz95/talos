<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_api_tokens', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('token_hash', 64)->unique();
            $table->json('scopes');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->boolean('is_disabled')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['is_disabled', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_api_tokens');
    }
};
