// Util bersama untuk halaman pemesan: My Orders (orders-mahasiswa.html) & Track Order (track-order.html)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDleckycfk_xnbhXMnPivz3F1NCS9x5wCQ",
    authDomain: "bbite-campus.firebaseapp.com",
    projectId: "bbite-campus"
};
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

// Tunggu Firebase Auth selesai memeriksa sesi login (hasil: user atau null)
export function waitUser() {
    return new Promise((resolve) => {
        const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
    });
}

export const rp = (n) => "Rp " + (Number(n) || 0).toLocaleString("id-ID");
export const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const toMs = (ts) => (ts && typeof ts.toMillis === "function") ? ts.toMillis() : (Number(ts) || 0);

// Pesanan yang belum dibayar / gagal bayar tidak ditampilkan di My Orders
export function isVisible(o) {
    const s = String(o.status || "");
    return s !== "awaiting_payment" && !s.startsWith("payment_");
}

// Langkah-langkah pelacakan
export const STEPS_DELIVERY = [
    { title: "Order placed", sub: "Waiting for the canteen to confirm" },
    { title: "Preparing your food", sub: "The canteen is cooking your order" },
    { title: "Courier is picking up", sub: "Your courier is collecting the food from the canteen" },
    { title: "Heading to your location", sub: "Your courier is on the way to you" },
    { title: "Delivered", sub: "Enjoy your meal!" }
];
export const STEPS_PICKUP = [
    { title: "Order placed", sub: "Waiting for the canteen to confirm" },
    { title: "Preparing your food", sub: "The canteen is cooking your order" },
    { title: "Ready for pickup", sub: "Pick up your order at the canteen" },
    { title: "Picked up", sub: "Enjoy your meal!" }
];

// Menentukan posisi pesanan.
//  status        : diatur kantin  (pending -> preparing -> ready -> completed / rejected)
//  deliveryStatus: diatur kurir   (picking -> delivering -> delivered)
// step = indeks langkah yang sedang berjalan; langkah sebelumnya dianggap selesai.
export function stageOf(o) {
    const st = o.status, ds = o.deliveryStatus;
    const isDelivery = o.type !== "Pickup";
    const steps = isDelivery ? STEPS_DELIVERY : STEPS_PICKUP;
    const last = steps.length - 1;
    const R = (key, label, step, tone, extra) => Object.assign({ key, label, step, tone, steps, isDelivery, final: false }, extra || {});

    if (st === "rejected") return R("rejected", "Rejected", -1, "red", { final: true, headline: "Order rejected", note: "The canteen couldn't accept this order. You haven't been charged for an unfulfilled order." });
    if (isDelivery) {
        if (ds === "delivered") return R("delivered", "Completed", last, "green", { final: true, headline: "Order delivered", note: "Enjoy your meal!" });
        if (ds === "delivering") return R("delivering", "On the way", 3, "amber", { headline: "Heading to your location", note: "The courier has picked up your food and is on the way." });
        if (ds === "picking") return R("picking", "Picking up", 2, "amber", { headline: "Courier is picking up", note: "Your courier is collecting the food from the canteen." });
        if (st === "ready" || st === "completed") return R("ready", "Ready", 1, "amber", { headline: "Food is ready", note: "Waiting for a courier to pick it up.", waitingCourier: true });
    } else {
        if (st === "completed") return R("completed", "Completed", last, "green", { final: true, headline: "Order picked up", note: "Enjoy your meal!" });
        if (st === "ready") return R("ready", "Ready", 2, "amber", { headline: "Ready for pickup", note: "Your order is ready. Pick it up at the canteen." });
    }
    if (st === "preparing") return R("preparing", "Preparing", 1, "amber", { headline: "Preparing your food", note: "The canteen is cooking your order." });
    return R("pending", "Pending", 0, "amber", { headline: "Waiting for confirmation", note: "The canteen will confirm your order shortly." });
}

// Nama kantin: pesanan baru menyimpan merchantName. Pesanan lama: pakai merchantId (nama) atau cari di users/{uid}.
const nameCache = {};
export async function merchantInfo(o) {
    if (o.merchantName) return { name: o.merchantName, logo: o.merchantLogo || null };
    const id = String(o.merchantId || "");
    if (nameCache[id]) return nameCache[id];
    let info = { name: id || "Canteen", logo: null };
    if (id.length >= 20) { // kemungkinan UID akun merchant
        try {
            const s = await getDoc(doc(db, "users", id));
            if (s.exists()) {
                const d = s.data();
                info = { name: d.businessName || "Canteen", logo: d.logo || d.photoURL || null };
            } else info = { name: "Canteen", logo: null };
        } catch (e) { info = { name: "Canteen", logo: null }; }
    }
    nameCache[id] = info;
    return info;
}

export function logoHTML(info, size) {
    const s = size || 40;
    const initials = esc(String(info.name || "?").replace(/[^A-Za-z0-9& ]/g, "").trim().slice(0, 2).toUpperCase() || "?");
    if (info.logo && /^(https?:|data:image)/.test(info.logo)) {
        return `<div class="mo-logo" style="width:${s}px;height:${s}px"><img src="${esc(info.logo)}" alt="" onerror="this.parentNode.innerHTML='${initials}'"></div>`;
    }
    return `<div class="mo-logo" style="width:${s}px;height:${s}px">${initials}</div>`;
}

export const SVG = {
    clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};

// CSS bersama (nav bawah + elemen umum)
export const SHARED_CSS = `
.mo-logo{border-radius:50%;background:#FFF1D6;color:#C98A00;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:1px solid #F6E2A6}
.mo-logo img{width:100%;height:100%;object-fit:contain;background:#fff}
.mo-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:5px 11px;border-radius:14px;white-space:nowrap}
.mo-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.mo-badge.amber{background:#FFF1D6;color:#B07400}.mo-badge.green{background:#E8F7EE;color:#15803D}.mo-badge.red{background:#FDECEC;color:#C62828}
.bottom-nav{background:#FFF;border-top:1px solid #E5E7EB;box-shadow:none}
.nav-item{color:#6B7280}
.nav-item svg{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.nav-item.active{background:#FFF6DB;color:#C98A00;flex-direction:row;gap:8px;padding:10px 18px}
.nav-item.active span{font-weight:800}
`;
