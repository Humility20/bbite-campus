// Helper bersama untuk semua fungsi pembayaran (file berawalan "_" tidak dijadikan endpoint oleh Vercel)
const IS_PROD = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const BASE = IS_PROD ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';

function authHeader() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error('MIDTRANS_SERVER_KEY belum diisi di Vercel (Settings > Environment Variables)');
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

async function midtrans(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader()
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await r.json(); } catch (e) { /* respons kosong */ }
  return data;
}

// Waktu Midtrans berformat "YYYY-MM-DD HH:mm:ss" dalam WIB (UTC+7)
function remainingMs(expiryTime) {
  if (!expiryTime) return 15 * 60 * 1000;
  const t = Date.parse(String(expiryTime).replace(' ', 'T') + '+07:00');
  return isNaN(t) ? 15 * 60 * 1000 : Math.max(0, t - Date.now());
}

const PAID = ['settlement', 'capture'];
const FAILED = ['expire', 'cancel', 'deny', 'failure'];

function summarize(data) {
  const st = data.transaction_status || 'pending';
  return {
    transactionStatus: st,
    paid: PAID.includes(st) && data.fraud_status !== 'deny',
    failed: FAILED.includes(st),
    grossAmount: data.gross_amount ? Math.round(Number(data.gross_amount)) : null,
    remainingMs: remainingMs(data.expiry_time)
  };
}

function validRef(ref) {
  return typeof ref === 'string' && /^BB-[A-Za-z0-9]{10,40}$/.test(ref);
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

module.exports = { IS_PROD, midtrans, summarize, remainingMs, validRef, readBody };
