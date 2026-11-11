// EN ⇄ ID. English is the source text in the code; when language is 'id' a
// MutationObserver swaps exact-match text nodes / placeholders / titles using
// the dictionary below (+ a few patterns for counts and dates). Nothing to
// change in feature code: add a line here to translate a string.
// Unknown strings and data (customer/product names) are left untouched.
// ponytail: exact-match only — a sentence with embedded values needs a PATTERNS entry.
(function () {
  const KEY = 'mku-lang';
  const DICT = {
    // nav + shell
    'Target': 'Target', 'Customers': 'Pelanggan', 'Pricelist': 'Daftar Harga', 'Stock': 'Stok', 'Intel': 'Intel', 'Order': 'Pesanan', 'Toolkit': 'Toolkit',
    'Loading…': 'Memuat…', 'Retry': 'Coba lagi', 'Save': 'Simpan', 'Cancel': 'Batal', 'Close': 'Tutup', 'Send': 'Kirim', 'All': 'Semua', 'Name': 'Nama', 'Notes': 'Catatan',
    'Phone': 'Telepon', 'Role': 'Peran', 'Product': 'Produk', 'Category': 'Kategori', 'Install': 'Pasang', 'Optional': 'Opsional', 'Title': 'Judul',
    'Back / Exit': 'Kembali / Keluar', 'Refresh': 'Muat ulang', 'Export to Excel': 'Ekspor ke Excel',
    'App failed to load — check your connection.': 'Aplikasi gagal dimuat — periksa koneksi Anda.',
    "Couldn't load your data — check your connection.": 'Gagal memuat data — periksa koneksi Anda.',
    'Add to your home screen for quick access': 'Tambahkan ke layar utama agar mudah dibuka', 'Install Sales App': 'Pasang Aplikasi Sales',
    'Sales Team Portal · V2': 'Portal Tim Sales · V2', 'Select your name': 'Pilih nama Anda', '— Choose —': '— Pilih —',
    // profile
    'My Profile': 'Profil Saya', 'Edit Profile': 'Ubah Profil', 'Change PIN': 'Ganti PIN', 'Choose a new PIN': 'Pilih PIN baru', 'Log Out': 'Keluar', 'Log Out & Start Over': 'Keluar & Mulai Ulang',
    'Exit View As': 'Keluar dari Tampilan Sebagai', 'Viewing as': 'Melihat sebagai', "Reset Rep's PIN": 'Reset PIN Sales', "Reset a Rep's PIN": 'Reset PIN Sales',
    'Manager': 'Manajer', 'Super Admin': 'Super Admin', 'Regular rep / no special role': 'Sales biasa / tanpa peran khusus', 'Nestle Coordinator': 'Koordinator Nestlé',
    'Phone / WhatsApp': 'Telepon / WhatsApp', 'Active (can log in)': 'Aktif (bisa masuk)', 'Inactive': 'Tidak aktif',
    // intel tabs + forms
    'Recent': 'Terbaru', 'By Competitor': 'Per Kompetitor', 'Deals': 'Penawaran', 'Slow-Moving': 'Slow-Moving', 'Samples': 'Sampel',
    'Log Competitor Price': 'Catat Harga Kompetitor', 'Competitor Name *': 'Nama Kompetitor *', 'Product *': 'Produk *', 'Price *': 'Harga *', 'Unit *': 'Satuan *', 'Customer *': 'Pelanggan *', 'Quantity *': 'Jumlah *',
    'Request Deal / Hold Stock': 'Ajukan Penawaran / Tahan Stok', 'Submit Deal Request': 'Kirim Permintaan Penawaran', 'Agreed Price': 'Harga Disepakati', 'Discount / Deal Terms': 'Diskon / Syarat Penawaran', 'Reason / Notes': 'Alasan / Catatan',
    'Save Log Entry': 'Simpan Catatan Harga', 'Customer / Outlet': 'Pelanggan / Outlet',
    'Contacts': 'Kontak', 'Contacts Directory': 'Direktori Kontak', 'Add Contact': 'Tambah Kontak', '+ Add Contact': '+ Tambah Kontak', 'Save Contact': 'Simpan Kontak',
    'Visit Notes': 'Catatan Kunjungan', 'Add Visit Note': 'Tambah Catatan Kunjungan', '+ Add Visit Note': '+ Tambah Catatan Kunjungan', 'Save Note': 'Simpan Catatan', 'Note *': 'Catatan *',
    'Announcements': 'Pengumuman', 'Send Notification': 'Kirim Notifikasi', 'Send To': 'Kirim Ke', 'Everyone': 'Semua orang', 'Message *': 'Pesan *', 'Title *': 'Judul *',
    'Saved Drafts': 'Draf Tersimpan', 'Order History': 'Riwayat Pesanan', '+ Add to Order': '+ Tambah ke Pesanan', '+ New': '+ Baru',
    'In Stock': 'Tersedia', 'Out': 'Habis', 'Low': 'Menipis', 'Critical': 'Kritis', 'Urgent': 'Mendesak', 'Most Recent': 'Terbaru', 'Least Active': 'Paling Tidak Aktif', 'Top Spend': 'Pembelian Terbesar',
    'Top 5 Products (YTD)': '5 Produk Teratas (YTD)', 'Monthly Revenue': 'Pendapatan Bulanan', 'Company Overview': 'Ringkasan Perusahaan', 'Catalogs': 'Katalog', 'FAQ': 'FAQ',
    'Hotel': 'Hotel', 'Restaurant': 'Restoran', 'Catering': 'Katering', 'Wholesale': 'Grosir', 'Others': 'Lainnya', 'General': 'Umum', 'Promo': 'Promo',
    'Search customer…': 'Cari pelanggan…', 'Search product…': 'Cari produk…', 'Search product name…': 'Cari nama produk…', 'Search product or brand…': 'Cari produk atau merek…',
    'Search competitor or product…': 'Cari kompetitor atau produk…', 'Search FAQ…': 'Cari FAQ…', 'Search name, customer, or phone…': 'Cari nama, pelanggan, atau telepon…',
    'Customer / outlet name…': 'Nama pelanggan / outlet…', 'Notes (optional)': 'Catatan (opsional)', 'What happened on this visit?': 'Apa yang terjadi pada kunjungan ini?',
    'No matching entries': 'Tidak ada data yang cocok', 'No competitor intel logged yet': 'Belum ada data kompetitor', 'No deals logged yet': 'Belum ada penawaran', 'No matching deals': 'Tidak ada penawaran yang cocok',
    'Loading competitor intel…': 'Memuat intel kompetitor…',
    // slow-moving (assessment)
    'Assess': 'Nilai', 'Dashboard': 'Dasbor', 'Slow-Moving Products Assessment': 'Penilaian Produk Slow-Moving',
    'Evaluate customer interest and identify commercial opportunities across our selected slow-moving products.': 'Nilai minat pelanggan dan temukan peluang komersial dari produk slow-moving pilihan kami.',
    'In progress': 'Sedang berjalan', 'Start an assessment': 'Mulai penilaian', 'No matching customers': 'Tidak ada pelanggan yang cocok', 'No customers loaded': 'Pelanggan belum dimuat',
    'Not assessed': 'Belum dinilai', 'Saved': 'Tersimpan', 'Saving…': 'Menyimpan…', 'Not saved — will retry': 'Belum tersimpan — akan dicoba lagi', '‹ Back': '‹ Kembali', 'Next product ›': 'Produk berikutnya ›',
    'Review & complete': 'Tinjau & selesaikan', 'Review assessment': 'Tinjau penilaian', 'Submit assessment': 'Kirim penilaian', 'Submitting…': 'Mengirim…', 'Back to edit': 'Kembali mengedit',
    'Customer comment (optional)': 'Komentar pelanggan (opsional)', 'Assessment completed ✓': 'Penilaian selesai ✓',
    'Some products still have no answer': 'Masih ada produk yang belum dijawab', 'Nothing to submit yet': 'Belum ada yang bisa dikirim',
    'Still saving — check your connection and try again': 'Masih menyimpan — periksa koneksi lalu coba lagi', 'Customer not found': 'Pelanggan tidak ditemukan',
    'No slow-moving products are configured': 'Belum ada produk slow-moving yang diatur',
    'Interested': 'Tertarik', 'Needs sample': 'Butuh sampel', 'Price too high': 'Harga terlalu tinggi', 'Packaging issue': 'Masalah kemasan', 'Already using competitor': 'Sudah pakai kompetitor',
    'Not interested': 'Tidak tertarik', 'Not applicable': 'Tidak relevan', 'Not familiar with product': 'Belum kenal produk', 'Not familiar': 'Belum kenal', 'Competitor': 'Kompetitor',
    'Est. monthly volume (units)': 'Perkiraan volume bulanan (unit)', 'Target purchase date': 'Target tanggal pembelian', 'Sample requirements': 'Kebutuhan sampel', 'Follow-up required': 'Perlu tindak lanjut',
    'Target price (Rp)': 'Target harga (Rp)', 'Explanation (optional)': 'Penjelasan (opsional)', 'Requested packaging size': 'Ukuran kemasan yang diminta', 'Competitor brand': 'Merek kompetitor',
    'Reason for rejection': 'Alasan penolakan', 'Why not applicable': 'Mengapa tidak relevan', 'Product info or a sample could create an opportunity': 'Info produk atau sampel bisa membuka peluang',
    // slow-moving (dashboard)
    'Slow-Moving Products Intelligence': 'Intelijen Produk Slow-Moving', 'Loading dashboard…': 'Memuat dasbor…', 'Assessments': 'Penilaian', 'Customers assessed': 'Pelanggan dinilai', 'Completion rate': 'Tingkat penyelesaian',
    'Sample opportunities': 'Peluang sampel', 'Pricing objections': 'Keberatan harga', 'Packaging objections': 'Keberatan kemasan', 'Competitor-related': 'Terkait kompetitor', 'Overall': 'Keseluruhan', 'By product': 'Per produk',
    'Salespeople': 'Tim sales', 'Rep': 'Sales', 'Completion': 'Penyelesaian', 'Detail': 'Detail', 'Follow-ups': 'Tindak lanjut', 'Market insights': 'Wawasan pasar', 'Highest interest': 'Minat tertinggi', 'Low demand': 'Permintaan rendah',
    'Most common objections': 'Keberatan paling umum', 'Needs pricing intervention': 'Perlu intervensi harga', 'Needs product education': 'Perlu edukasi produk', 'Requested packaging': 'Kemasan yang diminta', 'Competitor brands': 'Merek kompetitor',
    'Customer feedback': 'Masukan pelanggan', 'All answers': 'Semua jawaban', 'All products': 'Semua produk', 'All salespeople': 'Semua sales', 'Follow-up only': 'Hanya tindak lanjut', 'Follow-up': 'Tindak lanjut',
    'Search customer, rep, product, comment…': 'Cari pelanggan, sales, produk, komentar…', 'No data yet': 'Belum ada data', 'No matching feedback': 'Tidak ada masukan yang cocok',
    'No completed assessments yet. Results appear here as salespeople submit them.': 'Belum ada penilaian selesai. Hasil muncul di sini saat sales mengirimkannya.',
    "This customer isn't in your current customer list": 'Pelanggan ini tidak ada di daftar pelanggan Anda',
    // samples
    'Log Sample': 'Catat Sampel', 'Sample': 'Sampel', '+ Sample': '+ Sampel', 'Mine': 'Milik saya', 'All reps': 'Semua sales', 'Open': 'Terbuka', 'Closed': 'Selesai',
    'Requested': 'Diminta', 'Sent': 'Terkirim', 'Feedback': 'Masukan', 'Done': 'Selesai', 'Cancelled': 'Dibatalkan', 'Positive': 'Positif', 'Negative': 'Negatif', 'Order placed': 'Sudah order',
    'Mark sent': 'Tandai terkirim', 'Mark done': 'Tandai selesai', 'Add': 'Tambah', 'Added to follow-up': 'Ditambahkan ke tindak lanjut', 'Sample logged': 'Sampel tercatat',
    'Customer asked': 'Pelanggan meminta', 'I want to sample': 'Saya ingin memberi sampel', 'Rep sampling': 'Sampel dari sales', 'Why': 'Alasan', 'Quantity / size': 'Jumlah / ukuran',
    'From Slow-Moving — customers who need a sample': 'Dari Slow-Moving — pelanggan yang butuh sampel',
    'No open samples. Tap “+ Sample” to log one.': 'Belum ada sampel terbuka. Ketuk “+ Sampel” untuk mencatat.', 'Nothing closed yet.': 'Belum ada yang selesai.',
    'Customer and product are required.': 'Pelanggan dan produk wajib diisi.', 'Loading samples…': 'Memuat sampel…', 'Search or type a name': 'Cari atau ketik nama', 'Search product': 'Cari produk', 'Unknown': 'Tidak diketahui',
    "Samples isn't set up on the server yet (migration 0018 is not applied).": 'Fitur Sampel belum disiapkan di server (migrasi 0018 belum diterapkan).',
  };
  const MON = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'Mei', Jun: 'Jun', Jul: 'Jul', Aug: 'Agu', Sep: 'Sep', Oct: 'Okt', Nov: 'Nov', Dec: 'Des' };
  const PATTERNS = [
    [/^(\d+) customers$/, '$1 pelanggan'],
    [/^Resume (\d+\/\d+)$/, 'Lanjut $1'],
    [/^Follow-ups \((\d+)\)$/, 'Tindak lanjut ($1)'], [/^Closed \((\d+)\)$/, 'Selesai ($1)'],
    [/^Overdue · (.+)$/, 'Terlambat · $1'], [/^Due today · (.+)$/, 'Jatuh tempo hari ini · $1'], [/^Follow up (.+)$/, 'Tindak lanjut $1'],
    [/^(.+) — all (\d+) products assessed\.$/, '$1 — semua $2 produk sudah dinilai.'],
    [/^(\d+)\/(\d+) completed$/, '$1/$2 selesai'], [/^(.+) · (\d+) assessed$/, '$1 · $2 dinilai'], [/^(\d+) see opportunity$/, '$1 peluang'],
    [/^Show more \((\d+) left\)$/, 'Lihat lainnya ($1 lagi)'],
    [/^Couldn't load your drafts: (.+)$/, 'Gagal memuat draf: $1'], [/^Couldn't (start|open|submit|add|update) — (.+)$/, 'Gagal — $2'],
    [/^(Sample|Reason|Packaging|Competitor|N\/A): (.+)$/, (m, k, v) => ({ Sample: 'Sampel', Reason: 'Alasan', Packaging: 'Kemasan', Competitor: 'Kompetitor', 'N/A': 'Tidak relevan' })[k] + ': ' + v],
    [/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, (m, d, mo) => d + ' ' + MON[mo]],
  ];

  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || ((navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en'); } catch (e) {}

  function xlate(s) {
    const k = s.trim(); if (!k) return s;
    let out = DICT[k];
    if (out === undefined) for (const [re, rep] of PATTERNS) if (re.test(k)) { out = k.replace(re, rep); break; }
    return out === undefined ? s : s.replace(k, out);
  }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const rec = new WeakMap(); // node|el -> { src, out } so we can restore English and detect app rewrites
  function sync(key, cur, set) {
    const r = rec.get(key); const src = r && cur === r.out ? r.src : cur;
    const out = lang === 'id' ? xlate(src) : src;
    if (out !== cur) set(out);
    if (out !== src || r) rec.set(key, { src, out });
  }
  // attribute records need a stable key per (el, attr)
  const attrKeys = new WeakMap();
  const keyFor = (el, a) => { let m = attrKeys.get(el); if (!m) attrKeys.set(el, m = {}); return m[a] || (m[a] = {}); };
  function walk(n) {
    if (n.nodeType === 3) { if (n.parentNode && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) sync(n, n.nodeValue, v => { n.nodeValue = v; }); return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName)) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) sync(keyFor(n, a), n.getAttribute(a), v => n.setAttribute(a, v));
    n.childNodes.forEach(walk);
  }

  let obs;
  function start() {
    obs = new MutationObserver(muts => {
      obs.disconnect(); // our own writes must not re-trigger
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') walk(m.target);
        else walk(m.target);
      }
      obs.observe(document.body, OPTS);
    });
    apply();
  }
  const OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  function apply() {
    if (!document.body) return;
    obs.disconnect(); document.documentElement.lang = lang; walk(document.body); obs.observe(document.body, OPTS);
    const b = document.getElementById('lang-toggle-btn'); if (b) b.textContent = lang === 'id' ? 'English' : 'Bahasa Indonesia';
  }
  window.I18n = {
    get lang() { return lang; },
    toggle() { lang = lang === 'id' ? 'en' : 'id'; try { localStorage.setItem(KEY, lang); } catch (e) {} apply(); },
    apply,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
