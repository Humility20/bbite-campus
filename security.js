/* BBite - modul keamanan bersama (2FA + Biometric Fingerprint + App Lock).
   Dipakai oleh: index.html (login), privacy-kurir.html, 2fa-kurir.html, dan semua halaman kurir.

   CARA KERJA
   - Status keamanan disimpan per akun (uid) di localStorage: kunci "bbite_sec_<uid>".
   - Fingerprint memakai WebAuthn (sensor bawaan HP/laptop). Browser tidak pernah memberikan data sidik jari,
     hanya hasil "terverifikasi atau tidak".
   - "App lock": selama sesi tab ini belum dibuka kuncinya (fingerprint / email+password+2FA), halaman kurir
     otomatis diarahkan ke index.html.
   - Halaman yang memuat file ini dengan atribut data-guard otomatis menjalankan App Lock:
       <script src="security.js" data-guard></script>

   CATATAN: ini masih front end saja (tanpa server). Untuk produksi, verifikasi WebAuthn, OTP, dan rahasia TOTP
   harus dipindah ke backend (mis. Cloud Functions). */
(function () {
    "use strict";

    // Jika true: perangkat tanpa sensor sidik jari (mis. laptop biasa) boleh memakai "mode demo" (ketuk untuk simulasi).
    // Ubah ke false saat rilis sungguhan.
    var ALLOW_DEMO_FINGERPRINT = true;
    // Jika true: kode OTP WhatsApp ditampilkan di layar (belum ada pengirim WhatsApp). Ubah ke false saat backend siap.
    var DEMO_OTP = true;

    var PREFIX = "bbite_sec_";
    var CUR = "bbite_cur_uid";
    var UNLOCK = "bbite_unlocked";

    function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } }
    function b64u(buf) {
        var s = "", b = new Uint8Array(buf);
        for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function unb64u(str) {
        str = str.replace(/-/g, "+").replace(/_/g, "/");
        while (str.length % 4) str += "=";
        var s = atob(str), out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }

    var BBSec = {
        ALLOW_DEMO_FINGERPRINT: ALLOW_DEMO_FINGERPRINT,
        DEMO_OTP: DEMO_OTP,

        /* ===== Status per akun ===== */
        // { twofa:bool, method:"wa"|"app", secret:"BASE32", bio:bool, credId:"..."|"demo", name, email }
        get: function (uid) { return (uid && readJSON(PREFIX + uid)) || {}; },
        save: function (uid, patch) {
            if (!uid) return {};
            var s = BBSec.get(uid);
            for (var k in patch) s[k] = patch[k];
            try { localStorage.setItem(PREFIX + uid, JSON.stringify(s)); } catch (e) {}
            return s;
        },
        curUid: function () { try { return localStorage.getItem(CUR) || ""; } catch (e) { return ""; } },
        setCurUid: function (uid) { try { localStorage.setItem(CUR, uid || ""); } catch (e) {} },

        /* ===== App lock ===== */
        isLocked: function () {
            var uid = BBSec.curUid();
            if (!uid) return false;
            var s = BBSec.get(uid);
            if (!s.twofa && !s.bio) return false;
            try { return sessionStorage.getItem(UNLOCK) !== uid; } catch (e) { return false; }
        },
        unlock: function (uid) { try { sessionStorage.setItem(UNLOCK, uid); } catch (e) {} },
        lock: function () { try { sessionStorage.removeItem(UNLOCK); } catch (e) {} },
        guard: function () {
            if (!BBSec.isLocked()) return;
            document.documentElement.style.visibility = "hidden";
            window.location.replace("index.html");
        },

        /* ===== Fingerprint (WebAuthn) ===== */
        // true jika perangkat punya sensor / pembuka kunci bawaan yang bisa dipakai browser
        sensorAvailable: async function () {
            try {
                return !!(window.isSecureContext && window.PublicKeyCredential &&
                    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
                    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
            } catch (e) { return false; }
        },
        // Daftarkan sidik jari. Mengembalikan credId. Melempar error jika dibatalkan / gagal.
        enrollFingerprint: async function (uid, email, name, signal) {
            var cred = await navigator.credentials.create({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    rp: { name: "BBite Campus", id: window.location.hostname },
                    user: { id: new TextEncoder().encode(uid).slice(0, 64), name: email || uid, displayName: name || email || "Courier" },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
                    attestation: "none",
                    timeout: 60000
                },
                signal: signal
            });
            if (!cred) throw new Error("no-credential");
            return b64u(cred.rawId);
        },
        // Minta sidik jari untuk login. Resolve jika cocok, reject jika dibatalkan / salah.
        verifyFingerprint: async function (credId, signal) {
            var res = await navigator.credentials.get({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    rpId: window.location.hostname,
                    allowCredentials: [{ type: "public-key", id: unb64u(credId), transports: ["internal"] }],
                    userVerification: "required",
                    timeout: 60000
                },
                signal: signal
            });
            if (!res) throw new Error("no-assertion");
            return true;
        },
        // Pesan ramah untuk error WebAuthn
        fingerprintError: function (e) {
            var n = e && e.name;
            if (n === "NotAllowedError") return "Fingerprint dibatalkan atau tidak dikenali. Coba lagi.";
            if (n === "InvalidStateError") return "Fingerprint untuk akun ini sudah terdaftar di perangkat ini. Coba lagi.";
            if (n === "NotSupportedError" || n === "SecurityError") return "Perangkat atau browser ini tidak mendukung login fingerprint.";
            return "Fingerprint gagal dibaca. Coba lagi.";
        },

        /* ===== OTP WhatsApp (demo) =====
           Front end tidak bisa mengirim WhatsApp sendiri: perlu backend yang memanggil penyedia WhatsApp
           (Fonnte, Twilio, WhatsApp Business API, dll). Saat backend siap: isi fungsi ini dan set DEMO_OTP = false. */
        sendWhatsAppOtp: async function (phone, code) {
            // TODO backend: await fetch("/api/send-otp", { method: "POST", body: JSON.stringify({ phone, code }) });
            return true;
        },
        newOtp: function () { return String(Math.floor(100000 + Math.random() * 900000)); },
        maskPhone: function (raw) {
            var d = String(raw || "").replace(/\D/g, "");
            if (d.indexOf("0") === 0) d = "62" + d.slice(1);
            if (d.indexOf("62") !== 0 || d.length < 9) return "";
            var local = d.slice(2);
            return "+62 " + local.slice(0, 3) + "-****-" + local.slice(-4);
        },

        /* ===== Authenticator App (TOTP, RFC 6238) ===== */
        B32: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
        newSecret: function () {
            var B32 = BBSec.B32;
            return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function (x) { return B32[x % 32]; }).join("");
        },
        _b32decode: function (s) {
            var bits = "", out = [];
            for (var i = 0; i < s.length; i++) bits += BBSec.B32.indexOf(s[i]).toString(2).padStart(5, "0");
            for (var j = 0; j + 8 <= bits.length; j += 8) out.push(parseInt(bits.slice(j, j + 8), 2));
            return new Uint8Array(out);
        },
        _totp: async function (secret, counter) {
            var key = await crypto.subtle.importKey("raw", BBSec._b32decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
            var buf = new ArrayBuffer(8), dv = new DataView(buf);
            dv.setUint32(0, Math.floor(counter / 4294967296)); dv.setUint32(4, counter >>> 0);
            var h = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
            var o = h[19] & 15;
            var n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
            return String(n % 1e6).padStart(6, "0");
        },
        // toleransi selisih jam +-30 detik
        checkTotp: async function (secret, code) {
            if (!secret) return false;
            var c = Math.floor(Date.now() / 30000);
            for (var d of [0, -1, 1]) if (await BBSec._totp(secret, c + d) === code) return true;
            return false;
        },

        /* ===== Cadangan ke Firestore (opsional, best effort) =====
           Supaya 2FA tetap diminta saat login dari perangkat lain. Fingerprint TIDAK disimpan di sini
           karena terikat ke perangkat. Dipanggil dari halaman yang sudah punya setDoc/doc/db. */
        pushRemote: async function (fb, uid, sec) {
            try {
                await fb.setDoc(fb.doc(fb.db, "users", uid), { security: sec }, { merge: true });
            } catch (e) { console.log("Sinkron keamanan ke Firestore gagal (diabaikan):", e && e.code); }
        },
        // Dipanggil saat login: samakan status 2FA lokal dengan data akun di Firestore
        mergeRemote: function (uid, remote) {
            if (!uid || !remote || typeof remote.twoFa !== "boolean") return;
            BBSec.save(uid, { twofa: remote.twoFa, method: remote.twoFaMethod || "wa", secret: remote.totpSecret || "" });
        }
    };

    window.BBSec = BBSec;

    // Auto App Lock untuk halaman yang memuat <script src="security.js" data-guard>
    var me = document.currentScript;
    if (me && me.hasAttribute("data-guard")) BBSec.guard();
})();
