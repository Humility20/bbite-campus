// POST /api/create-payment  { orderId, amount, customerName }
// Membuat QRIS dinamis (nominal sudah tertanam di QR) lewat Midtrans.
const { IS_PROD, midtrans, remainingMs, readBody } = require('./_midtrans');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, amount, customerName } = readBody(req);
    const gross = Math.round(Number(amount));

    if (typeof orderId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(orderId))
      return res.status(400).json({ error: 'orderId tidak valid' });
    if (!Number.isFinite(gross) || gross < 1000 || gross > 5000000)
      return res.status(400).json({ error: 'Nominal tidak valid' });

    const ref = 'BB-' + orderId;
    const data = await midtrans('POST', '/v2/charge', {
      payment_type: 'qris',
      transaction_details: { order_id: ref, gross_amount: gross },
      qris: { acquirer: 'gopay' },
      custom_expiry: { expiry_duration: 15, unit: 'minute' },
      customer_details: { first_name: String(customerName || 'Mahasiswa').slice(0, 50) }
    });

    if (String(data.status_code) !== '201') {
      return res.status(502).json({ error: data.status_message || 'Gagal membuat QRIS di Midtrans' });
    }

    const action = (data.actions || []).find(a => a.name === 'generate-qr-code');
    return res.status(200).json({
      ref,
      sandbox: !IS_PROD,
      qrString: data.qr_string || null,
      qrUrl: action ? action.url : null,
      remainingMs: remainingMs(data.expiry_time) || 15 * 60 * 1000
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
