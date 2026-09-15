package ai.talos.voice

import android.content.Context
import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import org.json.JSONObject

/**
 * Blueprint §7.1: `filesDir/voice/profiles/<uuid>.tvp` - internal app
 * storage, not external/shared storage, and `allowBackup="false"` already
 * keeps it out of backup/export flows (verified: manifest-level, not
 * per-file - this store adds nothing new to export by construction, it
 * just does not opt back in).
 *
 * V1's historical `(nonce length, nonce, ciphertext)` framing stays
 * readable. V2 adds only a public magic/schema prefix, then uses a distinct
 * AEAD key and [TalosVoiceProfilePayloadCodec]. Neither conditioning nor
 * prompt codes ever touch disk outside authenticated ciphertext.
 */
internal class TalosVoiceProfileStore(private val context: Context) {

    private val profilesDir: File
        get() = File(context.filesDir, "voice/profiles").apply { mkdirs() }

    fun save(profile: TalosVoiceProfileV1) = synchronized(MUTATION_LOCK) {
        writeAtomic(fileFor(profile.header.profileId), seal(profile))
    }

    fun save(profile: TalosVoiceProfileV2) = synchronized(MUTATION_LOCK) {
        val target = fileFor(profile.header.profileId)
        writeAtomic(target, seal(profile))
        val authenticated = loadFromBytes(profile.header.profileId, readAtomic(target))
        require(authenticated == TalosStoredVoiceProfile.Current(profile)) { "voice profile V2 readback differs after save" }
    }

    /** Compatibility door for enrollment code that still explicitly owns a V1 MOSS profile. */
    fun load(profileId: String): TalosVoiceProfileV1 = when (val stored = loadAny(profileId)) {
        is TalosStoredVoiceProfile.Legacy -> stored.profile
        is TalosStoredVoiceProfile.Current -> error("profile $profileId is V2; use loadAny")
    }

    fun loadAny(profileId: String): TalosStoredVoiceProfile = synchronized(MUTATION_LOCK) {
        val file = fileFor(profileId)
        require(file.isFile) { "No profile file for $profileId: ${file.absolutePath}" }
        loadFromBytes(profileId, readAtomic(file))
    }

    fun loadV2(profileId: String): TalosVoiceProfileV2 = when (val stored = loadAny(profileId)) {
        is TalosStoredVoiceProfile.Current -> stored.profile
        is TalosStoredVoiceProfile.Legacy -> error("profile $profileId has not been migrated to V2")
    }

    fun exists(profileId: String): Boolean = fileFor(profileId).isFile

    fun list(): List<String> = profilesDir.listFiles { file -> file.extension == "tvp" }
        ?.map { it.nameWithoutExtension }
        ?: emptyList()

    /** §7.2: delete = delete file + delete the Keystore alias - cryptographic erasure, both halves, every time. */
    fun delete(profileId: String) = synchronized(MUTATION_LOCK) {
        AtomicFile(fileFor(profileId)).delete()
        AtomicFile(rollbackFileFor(profileId)).delete()
        TalosVoiceProfileCipher.deleteKey(profileId, 1)
        TalosVoiceProfileCipher.deleteKey(profileId, TalosVoiceProfileHeaderV2.SCHEMA_VERSION)
    }

    fun rename(profileId: String, newDisplayName: String) = synchronized(MUTATION_LOCK) {
        when (val stored = loadAny(profileId)) {
            is TalosStoredVoiceProfile.Legacy -> save(
                stored.profile.copy(header = stored.profile.header.copy(displayName = newDisplayName)),
            )
            is TalosStoredVoiceProfile.Current -> save(
                stored.profile.copy(header = stored.profile.header.copy(displayName = newDisplayName)),
            )
        }
    }

    fun migrateV1ToV2Atomically(
        profileId: String,
        convert: (TalosVoiceProfileV1) -> TalosVoiceProfileV2,
        verify: (TalosVoiceProfileV2) -> Unit,
    ): TalosVoiceProfileV2 = synchronized(MUTATION_LOCK) {
        val target = fileFor(profileId)
        val rollback = rollbackFileFor(profileId)
        val originalBytes = readAtomic(target)
        val legacy = (loadFromBytes(profileId, originalBytes) as? TalosStoredVoiceProfile.Legacy)?.profile
            ?: error("profile $profileId is not V1")
        val candidate = convert(legacy)
        require(candidate.header.profileId == profileId) { "migrated profile id changed" }
        require(candidate.header.migratedFromSchemaVersion == 1) { "migrated profile does not declare V1 origin" }

        var v2KeyCreated = false
        try {
            // A V1 target cannot legitimately own an active V2 key. Remove a
            // stale alias from an interrupted older attempt before creating
            // the candidate, so failure cleanup has one unambiguous owner.
            TalosVoiceProfileCipher.deleteKey(profileId, TalosVoiceProfileHeaderV2.SCHEMA_VERSION)
            v2KeyCreated = true
            val candidateBytes = seal(candidate)
            TalosVoiceProfileMigrationTransaction.run(
                original = originalBytes,
                candidate = candidateBytes,
                writeRollback = { writeAtomic(rollback, it) },
                readRollback = { readAtomic(rollback) },
                writeCurrent = { writeAtomic(target, it) },
                readCurrent = { readAtomic(target) },
                authenticate = { bytes ->
                    (loadFromBytes(profileId, bytes) as? TalosStoredVoiceProfile.Current)?.profile
                        ?: error("migrated profile did not authenticate as V2")
                },
                verify = { authenticated ->
                    require(authenticated == candidate) { "migrated profile readback differs" }
                    verify(authenticated)
                },
            )
        } catch (error: Throwable) {
            if (v2KeyCreated) {
                runCatching { TalosVoiceProfileCipher.deleteKey(profileId, TalosVoiceProfileHeaderV2.SCHEMA_VERSION) }
                    .onFailure(error::addSuppressed)
            }
            throw error
        }
    }

    fun hasV1Rollback(profileId: String): Boolean = synchronized(MUTATION_LOCK) {
        rollbackFileFor(profileId).isFile
    }

    fun rollbackToV1(profileId: String): TalosVoiceProfileV1 = synchronized(MUTATION_LOCK) {
        val rollback = rollbackFileFor(profileId)
        require(rollback.isFile) { "No V1 rollback for profile $profileId" }
        val originalBytes = readAtomic(rollback)
        val legacy = (loadFromBytes(profileId, originalBytes) as? TalosStoredVoiceProfile.Legacy)?.profile
            ?: error("voice profile rollback is not V1")
        val target = fileFor(profileId)
        writeAtomic(target, originalBytes)
        require(readAtomic(target).contentEquals(originalBytes)) { "voice profile V1 rollback commit differs" }
        TalosVoiceProfileCipher.deleteKey(profileId, TalosVoiceProfileHeaderV2.SCHEMA_VERSION)
        AtomicFile(rollback).delete()
        legacy
    }

    private fun seal(profile: TalosVoiceProfileV1): ByteArray {
        val plaintext = profile.toJson().toString().toByteArray(Charsets.UTF_8)
        val sealed = TalosVoiceProfileCipher.encrypt(profile.header.profileId, plaintext, schemaVersion = 1)
        return TalosVoiceProfileEnvelope.encode(1, sealed)
    }

    private fun seal(profile: TalosVoiceProfileV2): ByteArray {
        val plaintext = TalosVoiceProfilePayloadCodec.encode(profile)
        val sealed = TalosVoiceProfileCipher.encrypt(
            profile.header.profileId,
            plaintext,
            schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
        )
        return TalosVoiceProfileEnvelope.encode(TalosVoiceProfileHeaderV2.SCHEMA_VERSION, sealed)
    }

    private fun loadFromBytes(profileId: String, bytes: ByteArray): TalosStoredVoiceProfile {
        val envelope = TalosVoiceProfileEnvelope.decode(bytes)
        val plaintext = TalosVoiceProfileCipher.decrypt(
            profileId,
            envelope.sealed,
            schemaVersion = envelope.schemaVersion,
        )
        val stored = when (envelope.schemaVersion) {
            1 -> TalosStoredVoiceProfile.Legacy(
                TalosVoiceProfileV1.fromJson(JSONObject(String(plaintext, Charsets.UTF_8))),
            )
            TalosVoiceProfileHeaderV2.SCHEMA_VERSION -> TalosStoredVoiceProfile.Current(
                TalosVoiceProfilePayloadCodec.decode(plaintext),
            )
            else -> error("unsupported voice profile schema ${envelope.schemaVersion}")
        }
        require(stored.profileId == profileId) { "voice profile id differs from its file name" }
        return stored
    }

    private fun writeAtomic(file: File, bytes: ByteArray) {
        require(bytes.isNotEmpty() && bytes.size <= MAX_FILE_BYTES) { "voice profile file size is invalid" }
        val atomic = AtomicFile(file)
        val stream = atomic.startWrite()
        try {
            stream.write(bytes)
            atomic.finishWrite(stream)
        } catch (error: Throwable) {
            atomic.failWrite(stream)
            throw error
        }
    }

    private fun readAtomic(file: File): ByteArray = AtomicFile(file).readFully().also { bytes ->
        require(bytes.isNotEmpty() && bytes.size <= MAX_FILE_BYTES) { "voice profile file size is invalid" }
    }

    private fun fileFor(profileId: String): File {
        require(PROFILE_ID.matches(profileId)) { "invalid voice profile id" }
        return File(profilesDir, "$profileId.tvp")
    }

    private fun rollbackFileFor(profileId: String): File {
        require(PROFILE_ID.matches(profileId)) { "invalid voice profile id" }
        return File(profilesDir, "$profileId.tvp.v1.rollback")
    }

    companion object {
        private const val MAX_FILE_BYTES = 4 * 1024 * 1024 + 128
        private val PROFILE_ID = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
        private val MUTATION_LOCK = Any()
    }
}


/**
 * Pure crash/failure boundary used by [TalosVoiceProfileStore]'s Android
 * `AtomicFile` adapter. Keeping the ordering here testable means a fault
 * between candidate commit, authentication and preview cannot silently turn
 * the only readable V1 file into an unverified V2 file.
 */
internal class TalosVoiceProfileStoreMigrationCommitter(
    private val store: TalosVoiceProfileStore,
) : TalosVoiceProfileMigrationCommitter {
    override fun commit(
        expectedLegacy: TalosVoiceProfileV1,
        candidate: TalosVoiceProfileV2,
    ): TalosVoiceProfileV2 {
        check(candidate.header.profileId == expectedLegacy.header.profileId) {
            "voice profile migration candidate changed the profile id"
        }
        return store.migrateV1ToV2Atomically(
            profileId = expectedLegacy.header.profileId,
            convert = { liveLegacy ->
                check(liveLegacy.contentEquals(expectedLegacy)) {
                    "voice profile V1 changed after migration preview"
                }
                candidate
            },
            verify = { authenticated ->
                check(authenticated == candidate) { "voice profile V2 authenticated readback differs" }
            },
        )
    }

    private fun TalosVoiceProfileV1.contentEquals(other: TalosVoiceProfileV1): Boolean =
        header == other.header &&
            qualityMetrics == other.qualityMetrics &&
            promptAudioCodes.size == other.promptAudioCodes.size &&
            promptAudioCodes.indices.all { index ->
                promptAudioCodes[index].contentEquals(other.promptAudioCodes[index])
            }
}

internal object TalosVoiceProfileMigrationTransaction {
    fun <T> run(
        original: ByteArray,
        candidate: ByteArray,
        writeRollback: (ByteArray) -> Unit,
        readRollback: () -> ByteArray,
        writeCurrent: (ByteArray) -> Unit,
        readCurrent: () -> ByteArray,
        authenticate: (ByteArray) -> T,
        verify: (T) -> Unit,
    ): T {
        val originalSnapshot = original.copyOf()
        val candidateSnapshot = candidate.copyOf()
        writeRollback(originalSnapshot)
        require(readRollback().contentEquals(originalSnapshot)) {
            "voice profile V1 rollback readback differs"
        }

        return try {
            writeCurrent(candidateSnapshot)
            val committed = readCurrent()
            require(committed.contentEquals(candidateSnapshot)) {
                "voice profile V2 committed bytes differ"
            }
            val authenticated = authenticate(committed)
            verify(authenticated)
            authenticated
        } catch (error: Throwable) {
            try {
                writeCurrent(originalSnapshot)
                check(readCurrent().contentEquals(originalSnapshot)) {
                    "voice profile V1 restore readback differs"
                }
            } catch (restoreError: Throwable) {
                error.addSuppressed(restoreError)
            }
            throw error
        }
    }
}


internal data class TalosDecodedVoiceProfileEnvelope(
    val schemaVersion: Int,
    val sealed: TalosVoiceCiphertext,
)


/**
 * V1's historical framing is preserved exactly. V2 adds a public magic and
 * schema integer so the store can select one Keystore alias without trying
 * keys or parsing unauthenticated plaintext.
 */
internal object TalosVoiceProfileEnvelope {
    private const val MAGIC_V2 = 0x54565032 // "TVP2"
    private const val GCM_NONCE_BYTES = 12
    private const val GCM_TAG_BYTES = 16
    private const val MAX_CIPHERTEXT_BYTES = 4 * 1024 * 1024 + GCM_TAG_BYTES

    fun encode(schemaVersion: Int, sealed: TalosVoiceCiphertext): ByteArray {
        require(schemaVersion in 1..TalosVoiceProfileHeaderV2.SCHEMA_VERSION) {
            "unsupported voice profile envelope schema"
        }
        require(sealed.nonce.size == GCM_NONCE_BYTES) { "voice profile GCM nonce must be 96 bits" }
        require(sealed.ciphertext.size in GCM_TAG_BYTES..MAX_CIPHERTEXT_BYTES) {
            "voice profile ciphertext size is invalid"
        }
        return ByteArrayOutputStream().use { bytes ->
            DataOutputStream(bytes).use { output ->
                if (schemaVersion >= TalosVoiceProfileHeaderV2.SCHEMA_VERSION) {
                    output.writeInt(MAGIC_V2)
                    output.writeInt(schemaVersion)
                }
                output.writeInt(sealed.nonce.size)
                output.write(sealed.nonce)
                output.write(sealed.ciphertext)
            }
            bytes.toByteArray()
        }
    }

    fun decode(bytes: ByteArray): TalosDecodedVoiceProfileEnvelope {
        require(bytes.size >= Int.SIZE_BYTES + 1 + GCM_TAG_BYTES) { "voice profile envelope is truncated" }
        return try {
            DataInputStream(ByteArrayInputStream(bytes)).use { input ->
                val first = input.readInt()
                val schemaVersion: Int
                val nonceLength: Int
                if (first == MAGIC_V2) {
                    schemaVersion = input.readInt()
                    require(schemaVersion == TalosVoiceProfileHeaderV2.SCHEMA_VERSION) {
                        "unsupported voice profile envelope schema"
                    }
                    nonceLength = input.readInt()
                } else {
                    schemaVersion = 1
                    nonceLength = first
                }
                require(nonceLength in 1..64) { "voice profile nonce length is invalid" }
                require(input.available() >= nonceLength + GCM_TAG_BYTES) { "voice profile envelope is truncated" }
                val nonce = ByteArray(nonceLength).also(input::readFully)
                val ciphertext = ByteArray(input.available()).also(input::readFully)
                require(ciphertext.size <= MAX_CIPHERTEXT_BYTES) { "voice profile ciphertext exceeds the size limit" }
                TalosDecodedVoiceProfileEnvelope(
                    schemaVersion = schemaVersion,
                    sealed = TalosVoiceCiphertext(nonce, ciphertext),
                )
            }
        } catch (error: IllegalArgumentException) {
            throw error
        } catch (error: Exception) {
            throw IllegalArgumentException("voice profile envelope decode failed", error)
        }
    }
}
