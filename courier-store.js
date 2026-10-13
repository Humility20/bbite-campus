/* Penyimpanan bersama untuk halaman kurir (home-kurir.html & orders-kurir.html).
   Sementara memakai localStorage sebagai placeholder sampai order dihubungkan ke Firestore. */
(function () {
    var KEY = "bbite_courier_v1";
    var BASE = { deliveries: 5, earnings: 25000 };
    var mem = null;

    // Data contoh order masuk (placeholder)
    var ORDERS = [
        { id: 1042, time: "Just now", pickup: "Hokben Kantin B1", dropoff: "Lobby Gedung Utama", fee: 5000,
          customer: "Budi S.", phone: "0812-3456-7890", note: "Tunggu di dekat pos satpam lobi ya.",
          payment: "Cashless (OVO)", paid: true,
          items: [ { qty: 1, name: "Beef teriyaki bowl", price: 34000 }, { qty: 1, name: "Chicken yakiniku bento", price: 42000 } ] },
        { id: 1041, time: "2 mins ago", pickup: "Starbucks", dropoff: "Library 2nd Floor", fee: 5000,
          customer: "Siska", phone: "0813-2222-3333", note: "",
          payment: "Cashless (GoPay)", paid: true,
          items: [ { qty: 1, name: "Iced Caramel Macchiato", price: 55000 }, { qty: 1, name: "Butter Croissant", price: 35000 } ] }
    ];

    function load() {
        var s = null;
        try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = mem; }
        s = s || mem || {};
        s.active = s.active || {};
        s.withdrawals = s.withdrawals || [];
        s.accounts = s.accounts || [];
        s.done = (s.done || []).map(function (e) {
            if (typeof e !== "number") return e;
            var o = get(e) || {};
            return { id: e, result: "completed", at: null, pickup: o.pickup, dropoff: o.dropoff, fee: o.fee || 0 };
        });
        return s;
    }
    function save(s) {
        mem = s;
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    }
    // Chat disimpan terpisah dari state order (gambar bisa besar)
    var CHAT_KEY = "bbite_courier_chat_v1";
    var chatMem = null;
    function loadChats() {
        var c = null;
        try { c = JSON.parse(localStorage.getItem(CHAT_KEY)); } catch (e) { c = chatMem; }
        return c || chatMem || {};
    }
    function saveChats(c) {
        chatMem = c;
        try { localStorage.setItem(CHAT_KEY, JSON.stringify(c)); } catch (e) {}
    }
    // ===== Wallet (placeholder sampai terhubung ke backend) =====
    var BALANCE_BASE = 145000;
    var WEEK_BASE = [ { e: 38000, n: 7 }, { e: 22000, n: 4 }, { e: 65000, n: 12 }, { e: 31000, n: 6 }, { e: 52000, n: 10 }, { e: 0, n: 0 }, { e: 0, n: 0 } ]; // Sen..Min (hari sebelum hari ini)
    var DEFAULT_ACCOUNT = { id: "default", type: "Bank BCA", short: "BCA", number: "1234567890", name: "Gihon" };
    function pad4(n) { return String(n).padStart(4, "0"); }
    function weekStartTs(d) {
        var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        x.setDate(x.getDate() - ((d.getDay() + 6) % 7));
        return x.getTime();
    }

    // ===== Order otomatis (mode uji coba) =====
    // Setiap kali stok order di Home kurang dari MIN_AVAILABLE, order baru dibuat otomatis.
    var MIN_AVAILABLE = 2;
    var EXTRA_KEY = "bbite_courier_orders_v1";
    var extraMem = null;
    function loadExtras() {
        var x = null;
        try { x = JSON.parse(localStorage.getItem(EXTRA_KEY)); } catch (e) { x = extraMem; }
        return x || extraMem || [];
    }
    function saveExtras(x) {
        extraMem = x;
        try { localStorage.setItem(EXTRA_KEY, JSON.stringify(x)); } catch (e) {}
    }
    var TEMPLATES = [
        { pickup: "Hokben Kantin B1", items: [["Beef teriyaki bowl", 34000], ["Chicken yakiniku bento", 42000], ["Ebi furai bento", 39000], ["Es teh manis", 8000]] },
        { pickup: "Starbucks", items: [["Iced Caramel Macchiato", 55000], ["Java Chip Frappuccino", 62000], ["Butter Croissant", 35000]] },
        { pickup: "Kantin Syahdan", items: [["Nasi ayam geprek", 22000], ["Mie goreng spesial", 20000], ["Es jeruk", 7000]] },
        { pickup: "Yoshinoya", items: [["Beef bowl regular", 32000], ["Chicken teriyaki bowl", 30000]] },
        { pickup: "A&W", items: [["Chicken Wings 3pcs", 35000], ["Root Beer Float", 24000], ["Curly Fries", 22000]] }
    ];
    var DROPOFFS = ["Lobby Gedung Utama", "Library 2nd Floor", "Classroom 301", "Classroom 408", "Student Lounge", "Lab Komputer Lt. 5"];
    var NAMES = ["Andi P.", "Siska", "Rina W.", "Dimas A.", "Putri N.", "Kevin L.", "Maya S.", "Bagas R."];
    var NOTES = ["", "", "Tolong jangan pakai sambal ya.", "Tunggu di depan pintu kelas ya.", "Es batunya dipisah ya.", "Tunggu di dekat pos satpam lobi ya."];
    var PAYMENTS = [["Cashless (OVO)", true], ["Cashless (GoPay)", true], ["Cash (COD)", false]];
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function digits(n) { var t = ""; for (var i = 0; i < n; i++) t += Math.floor(Math.random() * 10); return t; }
    function nextId(extras) {
        var m = 0;
        ORDERS.concat(extras).forEach(function (o) { if (o.id > m) m = o.id; });
        var s = load();
        s.done.forEach(function (e) { if (e.id > m) m = e.id; });
        return m + 1;
    }
    function makeOrder(extras) {
        var t = pick(TEMPLATES);
        var pool = t.items.slice(), items = [];
        var n = 1 + Math.floor(Math.random() * Math.min(2, pool.length));
        for (var i = 0; i < n; i++) {
            var it = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
            items.push({ qty: Math.random() < 0.25 ? 2 : 1, name: it[0], price: it[1] });
        }
        var pay = pick(PAYMENTS);
        return { id: nextId(extras), createdAt: Date.now(), pickup: t.pickup, dropoff: pick(DROPOFFS),
                 fee: pick([5000, 5000, 6000]), customer: pick(NAMES), phone: "08" + digits(2) + "-" + digits(4) + "-" + digits(4),
                 note: pick(NOTES), payment: pay[0], paid: pay[1], items: items };
    }

    function inDone(s, id) { return s.done.some(function (e) { return e.id === Number(id); }); }
    function entry(o, result) {
        return { id: o.id, result: result, at: Date.now(), pickup: o.pickup, dropoff: o.dropoff, fee: result === "completed" ? o.fee : 0 };
    }
    function get(id) { id = Number(id); return ORDERS.concat(loadExtras()).filter(function (o) { return o.id === id; })[0] || null; }

    window.CourierStore = {
        orders: ORDERS,
        get: get,
        // order yang belum diterima & belum selesai
        available: function () {
            var s = load();
            function free(o) { return !s.active[o.id] && !inDone(s, o.id); }
            var extras = loadExtras();
            var list = ORDERS.concat(extras).filter(free);
            var added = false;
            while (list.length < MIN_AVAILABLE) {
                var o = makeOrder(extras);
                extras.push(o); list.push(o); added = true;
            }
            if (added) saveExtras(extras);
            return list.sort(function (a, b) { return b.id - a.id; });
        },
        // label waktu: "Just now" / "N mins ago"
        ago: function (o) {
            if (!o.createdAt) return o.time || "";
            var m = Math.floor((Date.now() - o.createdAt) / 60000);
            return m < 1 ? "Just now" : m + " min" + (m > 1 ? "s" : "") + " ago";
        },
        // Khusus demo: kembalikan semua data kurir ke kondisi awal
        resetAll: function () {
            mem = null; chatMem = null; extraMem = null;
            try { localStorage.removeItem(KEY); localStorage.removeItem(CHAT_KEY); localStorage.removeItem(EXTRA_KEY); } catch (e) {}
        },
        accept: function (id) {
            var s = load(); var o = get(id);
            if (!o || s.active[o.id] || inDone(s, o.id)) return;
            s.active[o.id] = { status: "picking", checked: o.items.map(function () { return false; }), at: Date.now() };
            save(s);
        },
        // daftar order aktif: [{order, status, checked}]
        active: function () {
            var s = load();
            return Object.keys(s.active).map(function (id) {
                return { order: get(id), status: s.active[id].status, checked: s.active[id].checked, at: s.active[id].at };
            }).filter(function (a) { return a.order; }).sort(function (a, b) { return a.at - b.at; });
        },
        statusOf: function (id) {
            var s = load(); id = Number(id);
            if (s.active[id]) return s.active[id].status;
            var e = s.done.filter(function (x) { return x.id === id; })[0];
            if (e) return e.result === "cancelled" ? "cancelled" : "done";
            return null;
        },
        checkedOf: function (id) {
            var s = load(); id = Number(id); var o = get(id);
            if (s.active[id]) return s.active[id].checked;
            return o ? o.items.map(function () { return true; }) : [];
        },
        setChecked: function (id, idx, val) {
            var s = load(); id = Number(id);
            if (!s.active[id]) return;
            s.active[id].checked[idx] = !!val; save(s);
        },
        allChecked: function (id) {
            return this.checkedOf(id).every(Boolean);
        },
        // picking -> delivering -> done
        advance: function (id) {
            var s = load(); id = Number(id); var a = s.active[id];
            if (!a) return null;
            if (a.status === "picking") { a.status = "delivering"; }
            else if (a.status === "delivering") { delete s.active[id]; s.done.push(entry(get(id), "completed")); }
            save(s);
            return this.statusOf(id);
        },
        // ===== Chat kurir <-> customer (per order) =====
        // pesan: { from: "courier" | "customer", type: "text" | "image", text, img, at }
        chatMessages: function (id) { return loadChats()[Number(id)] || []; },
        sendMessage: function (id, msg) {
            var c = loadChats(); id = Number(id);
            c[id] = c[id] || [];
            c[id].push({ from: "courier", type: msg.type || "text", text: msg.text || "", img: msg.img || null, at: Date.now() });
            saveChats(c);
        },
        // Khusus demo: isi percakapan contoh seperti di desain. Console: CourierStore.seedDemoChat(1042)
        seedDemoChat: function (id) {
            var c = loadChats(); var d = new Date(); d.setHours(10, 15, 0, 0);
            var t = d.getTime();
            c[Number(id)] = [
                { from: "courier",  type: "text", text: "Halo, saya sudah di kantin dan sedang mengantre pesanan ya.", img: null, at: t },
                { from: "customer", type: "text", text: "Oke, terima kasih. Nanti kabari saja kalau sudah sampai di lobi gedung utama.", img: null, at: t + 120000 }
            ];
            saveChats(c);
        },
        // ===== Wallet =====
        accounts: function () { return [DEFAULT_ACCOUNT].concat(load().accounts); },
        addAccount: function (a) {
            var s = load();
            var acc = { id: "a" + Date.now(), type: a.type, short: a.short, number: a.number, name: a.name };
            s.accounts.push(acc); save(s);
            return acc;
        },
        wallet: function () {
            var s = load(), now = new Date();
            var ws = weekStartTs(now), todayIdx = (now.getDay() + 6) % 7;
            var days = [], orders = [], i;
            for (i = 0; i < 7; i++) {
                if (i < todayIdx) { days.push(WEEK_BASE[i].e); orders.push(WEEK_BASE[i].n); }
                else if (i === todayIdx) { days.push(BASE.earnings); orders.push(BASE.deliveries); }
                else { days.push(0); orders.push(0); }
            }
            var balance = BALANCE_BASE, tx = [];
            s.done.forEach(function (e) {
                if (e.result !== "completed") return;
                tx.push({ type: "fee", title: "Delivery Fee - Order #" + pad4(e.id), at: e.at, amount: e.fee });
                if (e.demo) return; // data contoh tidak mengubah saldo/statistik
                balance += e.fee;
                if (e.at && e.at >= ws) {
                    var idx = (new Date(e.at).getDay() + 6) % 7;
                    days[idx] += e.fee; orders[idx] += 1;
                }
            });
            s.withdrawals.forEach(function (w) {
                balance -= w.amount;
                tx.push({ type: "withdraw", title: "Withdrawal to " + w.short, at: w.at, amount: -w.amount });
            });
            tx.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
            var total = days.reduce(function (a, b) { return a + b; }, 0);
            var n = orders.reduce(function (a, b) { return a + b; }, 0);
            return { balance: balance, tx: tx, week: { days: days, total: total, orders: n, avg: n ? Math.round(total / n) : 0, todayIdx: todayIdx } };
        },
        withdraw: function (amount, accountId) {
            amount = Math.floor(Number(amount));
            if (!amount || amount <= 0) return { ok: false, error: "Masukkan nominal penarikan" };
            if (amount > this.wallet().balance) return { ok: false, error: "Nominal melebihi saldo tersedia" };
            var acc = this.accounts().filter(function (a) { return a.id === accountId; })[0];
            if (!acc) return { ok: false, error: "Pilih rekening tujuan" };
            var s = load();
            s.withdrawals.push({ amount: amount, at: Date.now(), accountId: acc.id, short: acc.short, number: acc.number });
            save(s);
            return { ok: true, account: acc };
        },
        // riwayat (selesai + dibatalkan), terbaru di atas
        history: function () {
            return load().done.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        },
        // batalkan order (yang sedang aktif / masih di Home) -> masuk History dengan status Cancelled
        cancel: function (id) {
            var s = load(); var o = get(id);
            if (!o || inDone(s, o.id)) return;
            delete s.active[o.id];
            s.done.push(entry(o, "cancelled"));
            save(s);
        },
        stats: function () {
            var s = load();
            var fees = 0, n = 0;
            s.done.forEach(function (e) { if (e.result === "completed" && !e.demo) { n++; fees += e.fee; } });
            return { deliveries: BASE.deliveries + n, earnings: BASE.earnings + fees };
        },
        // Khusus demo: isi riwayat contoh (tidak dihitung ke statistik Home).
        // Jalankan di console browser: CourierStore.seedDemoHistory(); lalu refresh halaman.
        seedDemoHistory: function () {
            var s = load();
            s.done = s.done.filter(function (e) { return !e.demo; });
            s.done.push(
                { id: 1038, result: "completed", at: new Date(2026, 8, 25, 14, 30).getTime(), pickup: "Hokben Kantin B1", dropoff: "Library 2nd Floor", fee: 6000, demo: true },
                { id: 1035, result: "completed", at: new Date(2026, 8, 25, 12, 15).getTime(), pickup: "Starbucks", dropoff: "Lobby Gedung Utama", fee: 5000, demo: true },
                { id: 988,  result: "cancelled", at: new Date(2026, 8, 24, 10, 5).getTime(),  pickup: "Kantin Syahdan", dropoff: "Classroom 301", fee: 0, demo: true }
            );
            save(s);
        },
        clearHistory: function () { var s = load(); s.done = []; save(s); }
    };
})();
