package ai.talos;

/**
 * SHA-256 whose state can be written down and picked up again.
 *
 * Two facts made this necessary. First: across nine on-device model apps read
 * at code level, NOT ONE verifies a cryptographic hash of the finished file —
 * the state of the art is checking four magic bytes. And a truncated GGUF does
 * not crash; it loads and produces plausible garbage, which is the worst
 * possible failure because nobody can tell it is happening.
 *
 * Second: the file is four gigabytes and the process gets killed. Android's
 * `MessageDigest` cannot be serialised, so surviving a kill would mean reading
 * all four gigabytes again after the download finishes — minutes of disk on a
 * phone, for something we could simply have remembered. The digest is hashed
 * as the bytes arrive and its state is checkpointed beside them, so a resumed
 * download continues the hash instead of restarting it.
 *
 * Written out rather than pulled in because the state has to be exportable,
 * which no JDK API offers. It is the published algorithm and nothing else, and
 * it is checked against `MessageDigest` itself on random input as well as
 * against the standard vectors — a hand-written hash that is never compared to
 * a reference is worse than no hash at all.
 */
public final class TalosResumableSha256 {

    private static final int[] K = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    };

    private final int[] h = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    };
    private final byte[] block = new byte[64];
    private int blockLength;
    private long totalBytes;

    public void update(byte[] data, int offset, int length) {
        int index = offset;
        int remaining = length;
        totalBytes += length;

        if (blockLength > 0) {
            int take = Math.min(64 - blockLength, remaining);
            System.arraycopy(data, index, block, blockLength, take);
            blockLength += take;
            index += take;
            remaining -= take;
            if (blockLength == 64) {
                compress(block, 0);
                blockLength = 0;
            }
        }
        while (remaining >= 64) {
            compress(data, index);
            index += 64;
            remaining -= 64;
        }
        if (remaining > 0) {
            System.arraycopy(data, index, block, 0, remaining);
            blockLength = remaining;
        }
    }

    /** Lowercase hex, which is the form Hugging Face reports `lfs.oid` in. */
    public String hex() {
        int[] finalH = h.clone();
        byte[] tail = new byte[128];
        int tailLength = blockLength;
        System.arraycopy(block, 0, tail, 0, blockLength);
        tail[tailLength++] = (byte) 0x80;
        int padTo = (tailLength <= 56) ? 56 : 120;
        while (tailLength < padTo) tail[tailLength++] = 0;
        long bits = totalBytes * 8L;
        for (int i = 7; i >= 0; i -= 1) tail[tailLength++] = (byte) (bits >>> (8 * i));

        int[] saved = h.clone();
        for (int offset = 0; offset < tailLength; offset += 64) compress(tail, offset);
        System.arraycopy(h, 0, finalH, 0, 8);
        System.arraycopy(saved, 0, h, 0, 8);

        StringBuilder out = new StringBuilder(64);
        for (int value : finalH) {
            for (int shift = 28; shift >= 0; shift -= 4) {
                out.append(Character.forDigit((value >>> shift) & 0xf, 16));
            }
        }
        return out.toString();
    }

    /**
     * The whole state, as a line that can sit in the sidecar next to the bytes.
     *
     * This is the point of the class: a download killed at 61% resumes with the
     * hash already carrying those 61%, so the finished file needs no second
     * pass over four gigabytes to be verified.
     */
    public String exportState() {
        StringBuilder out = new StringBuilder();
        for (int value : h) out.append(Integer.toHexString(value)).append(':');
        out.append(totalBytes).append(':').append(blockLength).append(':');
        for (int i = 0; i < blockLength; i += 1) {
            out.append(Character.forDigit((block[i] >>> 4) & 0xf, 16));
            out.append(Character.forDigit(block[i] & 0xf, 16));
        }
        return out.toString();
    }

    /** Null for anything unreadable: a wrong hash state is worse than none. */
    public static TalosResumableSha256 restore(String state) {
        if (state == null) return null;
        String[] parts = state.split(":", -1);
        if (parts.length != 11) return null;
        try {
            TalosResumableSha256 digest = new TalosResumableSha256();
            for (int i = 0; i < 8; i += 1) digest.h[i] = (int) Long.parseLong(parts[i], 16);
            digest.totalBytes = Long.parseLong(parts[8]);
            digest.blockLength = Integer.parseInt(parts[9]);
            if (digest.blockLength < 0 || digest.blockLength > 63) return null;
            String buffered = parts[10];
            if (buffered.length() != digest.blockLength * 2) return null;
            for (int i = 0; i < digest.blockLength; i += 1) {
                digest.block[i] = (byte) Integer.parseInt(buffered.substring(i * 2, i * 2 + 2), 16);
            }
            return digest;
        } catch (RuntimeException malformed) {
            return null;
        }
    }

    public long bytesHashed() {
        return totalBytes;
    }

    private void compress(byte[] data, int offset) {
        int[] w = new int[64];
        for (int i = 0; i < 16; i += 1) {
            int j = offset + i * 4;
            w[i] = ((data[j] & 0xff) << 24) | ((data[j + 1] & 0xff) << 16)
                    | ((data[j + 2] & 0xff) << 8) | (data[j + 3] & 0xff);
        }
        for (int i = 16; i < 64; i += 1) {
            int s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            int s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }

        int a = h[0], b = h[1], c = h[2], d = h[3];
        int e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; i += 1) {
            int s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            int ch = (e & f) ^ (~e & g);
            int temp1 = hh + s1 + ch + K[i] + w[i];
            int s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            int maj = (a & b) ^ (a & c) ^ (b & c);
            int temp2 = s0 + maj;
            hh = g; g = f; f = e; e = d + temp1;
            d = c; c = b; b = a; a = temp1 + temp2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }

    private static int rotr(int value, int bits) {
        return (value >>> bits) | (value << (32 - bits));
    }
}
