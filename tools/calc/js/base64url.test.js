import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64Url, base64UrlToBytes } from './base64url.js';
test('bytesToBase64Url: empty array', () => {
    assert.equal(bytesToBase64Url(new Uint8Array([])), '');
});
test('bytesToBase64Url: single byte', () => {
    assert.equal(bytesToBase64Url(new Uint8Array([0])), 'AA');
    assert.equal(bytesToBase64Url(new Uint8Array([255])), '_w');
});
test('bytesToBase64Url: three bytes (no padding needed)', () => {
    assert.equal(bytesToBase64Url(new Uint8Array([1, 2, 3])), 'AQID');
});
test('bytesToBase64Url: URL-safe alphabet (no + or /)', () => {
    // bytes that in standard base64 would produce + and /
    const b = new Uint8Array([0xfb, 0xef, 0xff]);
    const s = bytesToBase64Url(b);
    assert.ok(!s.includes('+'));
    assert.ok(!s.includes('/'));
    assert.ok(!s.includes('='));
});
test('base64UrlToBytes: roundtrip arbitrary bytes', () => {
    const input = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 42]);
    const encoded = bytesToBase64Url(input);
    const decoded = base64UrlToBytes(encoded);
    assert.deepEqual(Array.from(decoded), Array.from(input));
});
test('base64UrlToBytes: roundtrip 100 random byte arrays', () => {
    for (let i = 0; i < 100; i++) {
        const len = Math.floor(Math.random() * 80) + 1;
        const input = new Uint8Array(len);
        for (let j = 0; j < len; j++)
            input[j] = Math.floor(Math.random() * 256);
        const encoded = bytesToBase64Url(input);
        const decoded = base64UrlToBytes(encoded);
        assert.deepEqual(Array.from(decoded), Array.from(input));
    }
});
//# sourceMappingURL=base64url.test.js.map