<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_model_profiles', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider');
            $table->string('model');
            $table->string('display_name');
            $table->text('encrypted_secret')->nullable();
            $table->string('base_url')->nullable();
            $table->string('status')->default('untested');
            $table->json('capabilities')->nullable();
            $table->json('probe_result')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'provider']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_model_profiles');
    }
};
