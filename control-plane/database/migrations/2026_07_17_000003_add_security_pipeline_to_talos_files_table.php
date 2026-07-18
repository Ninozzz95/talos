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
        Schema::table('talos_files', function (Blueprint $table): void {
            $table->string('detected_mime')->nullable()->after('mime_type');
            $table->string('scan_status')->default('pending')->after('status');
            $table->string('scan_engine')->nullable()->after('scan_status');
            $table->string('scan_engine_version')->nullable()->after('scan_engine');
            $table->string('scan_signature_version')->nullable()->after('scan_engine_version');
            $table->timestamp('scanned_at')->nullable()->after('scan_signature_version');
            $table->string('extraction_status')->default('pending')->after('scanned_at');
            $table->string('extractor')->nullable()->after('extraction_status');
            $table->string('extractor_version')->nullable()->after('extractor');
            $table->timestamp('extracted_at')->nullable()->after('extractor_version');

            $table->index('scan_status');
            $table->index('extraction_status');
        });

        DB::table('talos_files')
            ->where('status', 'available')
            ->update([
                'scan_status' => 'legacy_unverified',
                'extraction_status' => 'complete',
                'extractor' => 'talos_legacy',
                'extractor_version' => 'pre-b7.3b',
            ]);

        DB::table('talos_files')
            ->where('status', 'failed')
            ->update([
                'scan_status' => 'not_run',
                'extraction_status' => 'failed',
            ]);
    }

    public function down(): void
    {
        Schema::table('talos_files', function (Blueprint $table): void {
            $table->dropIndex(['scan_status']);
            $table->dropIndex(['extraction_status']);
            $table->dropColumn([
                'detected_mime',
                'scan_status',
                'scan_engine',
                'scan_engine_version',
                'scan_signature_version',
                'scanned_at',
                'extraction_status',
                'extractor',
                'extractor_version',
                'extracted_at',
            ]);
        });
    }
};
