/* jcrypto.js — the phone side of core/phone_bridge.py's envelope.
   AES-256-GCM, key = PBKDF2-SHA256(passphrase, "jarvis-phone-v1", 200000).
   Envelope: "v1." + base64url(iv[12] + ciphertext + tag[16]).
   Works in a browser (window.JCrypto) and in Node >= 20 (module.exports) for tests. */
(function (root) {
  var subtle = (root.crypto || require('node:crypto').webcrypto).subtle;
  var getRandom = function (u8) { return (root.crypto || require('node:crypto').webcrypto).getRandomValues(u8); };
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64e(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    var bin = atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function hex(u8) { return Array.prototype.map.call(u8, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

  async function deriveKey(pass) {
    var base = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('jarvis-phone-v1'), iterations: 200000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function seal(key, kind, fields) {
    var body = Object.assign({ t: Date.now(), n: hex(getRandom(new Uint8Array(8))), k: kind }, fields || {});
    var iv = getRandom(new Uint8Array(12));
    var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(body))));
    var out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return 'v1.' + b64e(out);
  }

  async function unseal(key, envelope) {
    try {
      if (typeof envelope !== 'string' || envelope.indexOf('v1.') !== 0) return null;
      var raw = b64d(envelope.slice(3));
      if (raw.length < 28) return null;
      var pt = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
      var obj = JSON.parse(dec.decode(pt));
      return obj && typeof obj === 'object' ? obj : null;
    } catch (_) { return null; }
  }

  var api = { deriveKey: deriveKey, seal: seal, unseal: unseal, b64e: b64e, b64d: b64d };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JCrypto = api;
})(typeof window !== 'undefined' ? window : globalThis);
