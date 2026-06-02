// assets/js/config.js

const CONFIG = {
  // Ganti dengan URL Apps Script Web App Anda setelah deploy
  API_URL: 'https://script.google.com/macros/s/AKfycbzdthnNSMJXw2aU1qCgFZ9xKD71DGkr5yRFXS1RrRGzieBfWKqVcEKn3L0IX6GyvoBC/exec',

  // Daftar semua kolom brand LDU (urutan sesuai Google Form)
  BRAND_LDU_COLUMNS: [
    'Apple', 'Samsung', 'Oppo', 'Vivo', 'Xiaomi', 'Infinix', 'Honor',
    'Realme', 'Tecno', 'Sharp', 'IQOO', 'Huawei', 'Motorola', 'Advan',
    'Apple Macbook', 'Acer Laptop', 'Asus Laptop', 'HP Laptop',
    'Huawei Laptop', 'Lenovo Laptop', 'Others Laptop',
    'Samsung CE', 'Xiaomi CE', 'Infinix CE', 'Toshiba CE', 'LG CE',
    'Polytron CE', 'Sharp CE', 'TCL CE', 'Sony CE', 'Changhong CE',
    'Accesories C-Brand'
  ],

  // Brand smartphone utama untuk kolom tabel
  BRAND_LDU_DISPLAY: ['Apple', 'Samsung', 'Oppo', 'Xiaomi', 'Huawei'],

  // Brand toko (untuk filter & summary compliance)
  BRAND_TOKO: ['Erafone', 'iBox', 'Samsung Store', 'Xiaomi Store', 'Megastore', 'Lainnya'],

  // Warna per brand toko
  BRAND_TOKO_COLORS: {
    'Erafone':       '#2563eb',
    'iBox':          '#6d28d9',
    'Samsung Store': '#1428A0',
    'Xiaomi Store':  '#FF6900',
    'Megastore':     '#0f766e',
    'Lainnya':       '#64748b'
  },

  // Deteksi brand toko dari nama toko
  detectBrandToko: function(storeName) {
    const n = (storeName || '').toUpperCase();
    if (n.includes('ERAFONE'))  return 'Erafone';
    if (n.includes('IBOX') || n.includes('I-BOX')) return 'iBox';
    if (n.includes('SAMSUNG') || n.startsWith('SES') || n.startsWith('SPS')) return 'Samsung Store';
    if (n.includes('XIAOMI'))   return 'Xiaomi Store';
    if (n.includes('MEGASTORE')) return 'Megastore';
    return 'Lainnya';
  },

  // Hitung total LDU semua brand dari 1 row data
  calcTotalLDU: function(row) {
    return CONFIG.BRAND_LDU_COLUMNS.reduce(function(sum, col) {
      return sum + (parseInt(row[col]) || 0);
    }, 0);
  },

  // Format tanggal ke Indonesia
  formatDate: function(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return val.toString();
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }
};
