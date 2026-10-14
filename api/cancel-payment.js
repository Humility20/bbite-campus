// POST /api/cancel-payment  { ref }
// Membatalkan QRIS yang belum dibayar supaya tidak bisa dibayar lagi setelah pesanan dibatalkan/kedaluwarsa.
const { midtrans, summarize, validRef, readBody } = require('./_midtrans');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ref } = readBody(req);
    if (!validRef(ref)) return res.status(400).json({ error: 'ref tidak valid' });

    // Kalau sudah dibayar, cancel akan ditolak Midtrans; status akhir tetap kita baca ulang di bawah.
    await midtrans('POST', '/v2/' + encodeURIComponent(ref) + '/cancel');
    const data = await midtrans('GET', '/v2/' + encodeURIComponent(ref) + '/status');
    return res.status(200).json(summarize(data));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
