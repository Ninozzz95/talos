<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_connectors', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('key')->unique();
            $table->string('display_name');
            $table->text('description')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->string('health_status')->default('unknown');
            $table->json('capabilities')->nullable();
            $table->json('policy')->nullable();
            $table->json('health_payload')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();

            $table->index(['is_enabled', 'health_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_connectors');
    }
};
