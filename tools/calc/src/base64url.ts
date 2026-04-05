// URL-safe base64 with no padding, per RFC 4648 §5.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += ALPHABET[(n >> 6) & 63];
    out += ALPHABET[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += ALPHABET[(n >> 6) & 63];
  }
  return out;
}

const DECODE_TABLE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE_TABLE[ALPHABET[i]] = i;
}

export function base64UrlToBytes(s: string): Uint8Array {
  const len = s.length;
  const fullGroups = Math.floor(len / 4);
  const rem = len % 4;
  const outLen = fullGroups * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);
  let oi = 0;
  let si = 0;
  for (let g = 0; g < fullGroups; g++) {
    const n =
      (DECODE_TABLE[s[si]] << 18) |
      (DECODE_TABLE[s[si + 1]] << 12) |
      (DECODE_TABLE[s[si + 2]] << 6) |
      DECODE_TABLE[s[si + 3]];
    out[oi++] = (n >> 16) & 0xff;
    out[oi++] = (n >> 8) & 0xff;
    out[oi++] = n & 0xff;
    si += 4;
  }
  if (rem === 2) {
    const n = (DECODE_TABLE[s[si]] << 18) | (DECODE_TABLE[s[si + 1]] << 12);
    out[oi++] = (n >> 16) & 0xff;
  } else if (rem === 3) {
    const n =
      (DECODE_TABLE[s[si]] << 18) |
      (DECODE_TABLE[s[si + 1]] << 12) |
      (DECODE_TABLE[s[si + 2]] << 6);
    out[oi++] = (n >> 16) & 0xff;
    out[oi++] = (n >> 8) & 0xff;
  }
  return out;
}
