// GET /api/payment-status?ref=BB-xxxx  -> status pembayaran asli dari Midtrans
const { midtrans, summarize, validRef } = require('./_midtrans');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ref = req.query && req.query.ref;
    if (!validRef(ref)) return res.status(400).json({ error: 'ref tidak valid' });

    const data = await midtrans('GET', '/v2/' + encodeURIComponent(ref) + '/status');
    // 404 = transaksi belum tercatat di Midtrans -> anggap masih menunggu
    if (String(data.status_code) === '404') {
      return res.status(200).json({ transactionStatus: 'pending', paid: false, failed: false, grossAmount: null, remainingMs: 0 });
    }
    return res.status(200).json(summarize(data));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
