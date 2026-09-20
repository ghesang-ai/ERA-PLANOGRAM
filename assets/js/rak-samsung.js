// assets/js/rak-samsung.js — ERA-PLANOGRAM Input Rak Aksesoris Samsung
// Requires: config.js, exifr, foto-upload.js (helper: getCurrentLocation, parseUserAgentDevice,
//           formatFotoAge, FOTO_MAX_AGE_MIN). Tidak memakai fungsi LDU di foto-upload.js.

var _rk = {
  cfg:    null,   // isi assets/data/rak-samsung.json
  store:  null,   // { code, name, area }
  items:  [],     // item yang berlaku untuk toko ini (strap hanya toko alokasi)
  st:     {},     // key -> { ok:[bool], file:{base64,meta}|null, url, fileId, meta, err }
  month:  ''
};
var _rkSubmitted = false;

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rkMonthNow() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

document.addEventListener('DOMContentLoaded', function() {
  updateProgress(1);
  fetch('assets/data/rak-samsung.json')
    .then(function(r) { return r.json(); })
    .then(function(cfg) { _rk.cfg = cfg; })
    .catch(function(err) { console.warn('rak-samsung.json gagal dimuat:', err); });

  var pc = document.getElementById('input-plant-code');
  pc.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') verifyPlantCode();
    this.value = this.value.toUpperCase();
  });
  window.addEventListener('beforeunload', function(ev) {
    if (!_rkSubmitted && rkPendingCount() > 0) { ev.preventDefault(); ev.returnValue = ''; }
  });
});

// ── Step 1: verifikasi Plant Code ──
function verifyPlantCode() {
  var code = (document.getElementById('input-plant-code').value || '').trim().toUpperCase();
  if (!code) { showVerifyError('Masukkan Plant Code terlebih dahulu.'); return; }
  if (!_rk.cfg) { showVerifyError('Data toko belum termuat. Tunggu sebentar lalu coba lagi.'); return; }

  var store = _rk.cfg.stores[code];
  if (!store) {
    showVerifyError('Plant Code <strong>' + escHtml(code) + '</strong> tidak terdaftar sebagai toko Samsung Store.');
    lockSteps();
    return;
  }

  _rk.store = { code: code, name: store.name, area: store.area || '-' };
  _rk.month = rkMonthNow();
  var strap = (_rk.cfg.strapStores || []).indexOf(code) !== -1;
  _rk.items = _rk.cfg.items.filter(function(it) { return !it.selected || strap; });
  _rk.st = {};
  _rk.items.forEach(function(it) { _rk.st[it.key] = { ok: it.types.map(function() { return true; }), file: null, url: '', fileId: '', meta: null, err: '' }; });
  _rkSubmitted = false;

  document.getElementById('verify-result').style.display = 'none';
  document.getElementById('info-store-name').textContent = store.name;
  document.getElementById('info-plant-code').textContent = code;
  document.getElementById('info-area').textContent = _rk.store.area;
  document.getElementById('info-item-count').textContent = '🗄️ ' + _rk.items.length + ' aksesoris perlu diupdate';
  document.getElementById('store-info').style.display = 'flex';

  unlockSteps();
  updateProgress(2);
  loadPreviousSubmit();
  renderItems();
  setTimeout(function() { document.getElementById('step-items').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
}

// Pre-fill dari submit sebelumnya bulan ini (supaya bisa melengkapi item yang kosong)
function loadPreviousSubmit() {
  var banner = document.getElementById('prev-submit-banner');
  banner.style.display = 'none';
  var url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', 'getRakSamsung');
  url.searchParams.set('store', _rk.store.code);
  url.searchParams.set('month', _rk.month);
  var code = _rk.store.code;
  fetch(url.toString())
    .then(function(r) { return r.json(); })
    .then(function(json) {
      if (!_rk.store || _rk.store.code !== code) return;          // sudah ganti toko
      if (json.status !== 'success' || !json.data || !json.data.items) return;
      var filled = 0;
      json.data.items.forEach(function(saved) {
        var s = _rk.st[saved.key];
        if (!s || !saved.photoUrl) return;
        s.url = saved.photoUrl; s.fileId = saved.fileId || rkFileId(saved.photoUrl); s.meta = saved.meta || null;
        if (saved.ok && saved.ok.length === s.ok.length) s.ok = saved.ok;
        filled++;
      });
      if (filled > 0) {
        banner.style.display = 'flex';
        banner.innerHTML = '<span style="font-size:16px">✅</span><div><strong>Submit bulan ini terdeteksi (' + filled + ' item sudah ada foto)</strong>' +
          '<div style="font-size:12px;margin-top:2px">Item yang sudah ada foto tidak perlu diupload ulang. Lengkapi item yang kosong lalu kirim lagi.</div></div>';
      }
      renderItems();
    })
    .catch(function() { /* offline / belum ada data: form tetap jalan */ });
}

function rkFileId(url) {
  var m = String(url || '').match(/\/d\/([^\/?]+)/);
  return m ? m[1] : '';
}

// ── Helpers status item ──
function rkHasPhoto(key)  { var s = _rk.st[key]; return !!(s && (s.file || s.url)); }
function rkQty(it) {
  var s = _rk.st[it.key];
  if (!rkHasPhoto(it.key)) return 0;
  return s.ok.filter(Boolean).length;
}
function rkPendingCount() {
  return Object.keys(_rk.st).filter(function(k) { return _rk.st[k].file; }).length;
}
function rkThumbSrc(s) {
  if (s.file) return s.file.base64;
  if (s.fileId) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(s.fileId) + '&sz=w300';
  return '';
}

// ── Step 2: daftar aksesoris ──
function renderItems() {
  if (!_rk.store) return;
  var q = (document.getElementById('rk-search').value || '').toLowerCase();
  var f = document.getElementById('rk-filter').value;

  var visible = _rk.items.filter(function(it, i) {
    if (q && it.name.toLowerCase().indexOf(q) === -1) return false;
    if (f === 'empty'  && rkHasPhoto(it.key))  return false;
    if (f === 'filled' && !rkHasPhoto(it.key)) return false;
    return true;
  });
  document.getElementById('rk-count').textContent = visible.length + ' item';

  document.getElementById('rak-list').innerHTML = visible.length === 0
    ? '<div class="cl-empty">Tidak ada item ditemukan</div>'
    : visible.map(function(it) {
        var no  = _rk.items.indexOf(it) + 1;
        var s   = _rk.st[it.key];
        var has = rkHasPhoto(it.key);
        var qty = rkQty(it);

        var pill = !has ? '<span class="rak-pill p-empty">Kosong</span>'
          : qty >= it.target ? '<span class="rak-pill p-full">✓ ' + qty + '/' + it.target + '</span>'
          : '<span class="rak-pill p-part">' + qty + '/' + it.target + '</span>';

        var chips = (has && it.types.length > 1)
          ? '<div class="rak-types">' + it.types.map(function(t, j) {
              return '<button type="button" class="rak-type' + (s.ok[j] ? ' on' : '') + '" onclick="toggleType(\'' + it.key + '\',' + j + ')">' +
                (s.ok[j] ? '✓ ' : '') + escHtml(t) + '</button>';
            }).join('') + '</div>'
          : '';

        var hint = it.types.length > 1
          ? 'Target display: <b>' + it.target + ' type model</b>' + (has ? ' — pilih yang ter-display' : '')
          : 'Target display: 1 model';

        var thumb = has ? '<img src="' + rkThumbSrc(s) + '" alt="" onerror="this.replaceWith(document.createTextNode(\'📷\'))">' : '📷';
        var info  = s.err ? '<span class="rak-info bad">' + escHtml(s.err) + '</span>'
                  : s.file ? '<span class="rak-info ok">✅ Foto baru siap upload</span>'
                  : s.url  ? '<span class="rak-info ok">✅ Sudah terkirim</span>' : '';

        return '<div class="rak-item' + (has ? ' filled' : '') + (s.err ? ' err' : '') + '" id="ri-' + it.key + '">' +
          '<div class="rak-thumb" onclick="document.getElementById(\'rf-' + it.key + '\').click()">' + thumb + '</div>' +
          '<div class="rak-body">' +
            '<div class="rak-top"><div class="rak-name"><span class="rak-no">' + no + '.</span>' + escHtml(it.name) + '</div>' + pill + '</div>' +
            '<div class="rak-hint">' + hint + '</div>' + chips +
            '<div class="rak-actions">' +
              '<label class="rak-btn" for="rf-' + it.key + '">' + (has ? '🔄 Ganti Foto' : '📷 Ambil / Pilih Foto') + '</label>' +
              '<input type="file" id="rf-' + it.key + '" accept="image/*" style="display:none" onchange="onRakFoto(\'' + it.key + '\',this)">' +
              (has ? '<button type="button" class="rak-btn del" onclick="removeFoto(\'' + it.key + '\')">Hapus</button>' : '') +
              info +
            '</div>' +
          '</div></div>';
      }).join('');

  updateItemsBadge();
  updateSummary();
}

function updateItemsBadge() {
  var filled = _rk.items.filter(function(it) { return rkHasPhoto(it.key); }).length;
  var badge = document.getElementById('items-badge');
  badge.textContent = filled + ' / ' + _rk.items.length + ' item';
  badge.classList.toggle('badge-has-value', filled > 0);
}

function toggleType(key, j) {
  var s = _rk.st[key];
  s.ok[j] = !s.ok[j];
  renderItems();
}

function removeFoto(key) {
  var s = _rk.st[key];
  s.file = null; s.url = ''; s.fileId = ''; s.meta = null; s.err = '';
  s.ok = s.ok.map(function() { return true; });
  renderItems();
}

// ── Foto: validasi (EXIF ≤ 2 jam + GPS, sama seperti LDU), crop 3:4, kompres ──
async function onRakFoto(key, input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var s = _rk.st[key];
  var box = document.getElementById('ri-' + key);
  var setInfo = function(html) {
    var el = box && box.querySelector('.rak-actions');
    if (!el) return;
    var old = el.querySelector('.rak-info'); if (old) old.remove();
    el.insertAdjacentHTML('beforeend', '<span class="rak-info">' + html + '</span>');
  };
  var fail = function(msg) { input.value = ''; s.err = msg; renderItems(); };

  setInfo('⏳ Membaca foto...');
  var device = '', takenAt = null;
  if (typeof exifr !== 'undefined') {
    try {
      var tags = (await exifr.parse(file, { exif: true, tiff: true, translateValues: true })) || {};
      device = [tags.Make, tags.Model].filter(Boolean).join(' ').trim();
      var raw = tags.DateTimeOriginal || tags.CreateDate || tags.ModifyDate;
      if (raw) { var d = raw instanceof Date ? raw : new Date(raw); if (!isNaN(d.getTime())) takenAt = d; }
    } catch (e) { /* EXIF opsional */ }
  }
  if (takenAt) {
    var ageMin = (Date.now() - takenAt.getTime()) / 60000;
    if (ageMin > FOTO_MAX_AGE_MIN || ageMin < -5) {
      return fail('❌ Foto diambil ' + formatFotoAge(Math.abs(ageMin)) + (ageMin < 0 ? ' ke depan (jam HP salah?)' : ' lalu') +
        '. Ambil foto baru langsung dari kamera (maks ' + formatFotoAge(FOTO_MAX_AGE_MIN) + ').');
    }
  }

  setInfo('⏳ Mengambil lokasi GPS...');
  var geo;
  try { geo = await getCurrentLocation(); }
  catch (err) {
    return fail((err && err.code === 1)
      ? '❌ Izin lokasi ditolak. Aktifkan izin Lokasi untuk browser ini lalu coba lagi.'
      : '❌ Gagal ambil lokasi GPS. Pastikan GPS aktif & sinyal bagus.');
  }
  if (!device) device = parseUserAgentDevice(navigator.userAgent);

  setInfo('⏳ Memproses foto...');
  rkCropCompress(file, function(res) {
    s.file = { base64: res.base64, meta: { lat: geo.lat, lng: geo.lng, takenAt: (takenAt || new Date()).toISOString(), device: device || 'Unknown device' } };
    s.url = ''; s.fileId = ''; s.err = '';
    s.ok = s.ok.map(function() { return true; });
    renderItems();
    if (res.landscape) showToast('ℹ️ Foto landscape dipotong otomatis ke 3:4. Lain kali foto mode potret ya.');
  });
}

// Potong tengah ke rasio 3:4 (potret) supaya pas di frame collage, lalu kompres ≤ ~500KB
function rkCropCompress(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var landscape = img.width > img.height;
      var sw, sh, sx, sy;
      if (img.width / img.height > 3 / 4) { sh = img.height; sw = sh * 3 / 4; sx = (img.width - sw) / 2; sy = 0; }
      else                                { sw = img.width;  sh = sw * 4 / 3;  sx = 0; sy = (img.height - sh) / 2; }
      var ow = Math.min(900, Math.round(sw)), oh = Math.round(ow * 4 / 3);
      var canvas = document.createElement('canvas');
      canvas.width = ow; canvas.height = oh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
      var q = 0.85, out = canvas.toDataURL('image/jpeg', q);
      while (out.length > 500 * 1024 * 1.37 && q > 0.35) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
      cb({ base64: out, landscape: landscape });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Step 3: ringkasan ──
function updateSummary() {
  if (!_rk.store) return;
  var filled = _rk.items.filter(function(it) { return rkHasPhoto(it.key); });
  var empty  = _rk.items.filter(function(it) { return !rkHasPhoto(it.key); });
  var target = _rk.items.reduce(function(a, it) { return a + it.target; }, 0);
  var actual = _rk.items.reduce(function(a, it) { return a + rkQty(it); }, 0);
  var pct    = target ? Math.round(actual / target * 100) : 0;

  document.getElementById('submit-summary').innerHTML =
    '<div class="summary-row"><div class="summary-label">Toko</div><div class="summary-value"><strong>' + escHtml(_rk.store.name) + '</strong></div></div>' +
    '<div class="summary-row"><div class="summary-label">Plant Code</div><div class="summary-value"><code>' + escHtml(_rk.store.code) + '</code> · Periode ' + rkMonthLabel(_rk.month) + '</div></div>' +
    '<div class="summary-row"><div class="summary-label">Item Ada Foto</div><div class="summary-value"><strong style="font-size:18px;color:var(--blue)">' + filled.length + '</strong> dari ' + _rk.items.length + ' aksesoris' +
      (rkPendingCount() ? ' <span style="color:var(--gray-400);font-size:12px">(' + rkPendingCount() + ' foto baru akan diupload)</span>' : '') + '</div></div>' +
    '<div class="summary-row"><div class="summary-label">Qty Display</div><div class="summary-value"><strong>' + actual + ' / ' + target + '</strong> model (' + pct + '%)</div></div>' +
    '<div class="summary-row"><div class="summary-label">Item Kosong</div><div class="summary-value">' +
      (empty.length ? '<div class="rak-miss">' + empty.map(function(it) { return '<span>' + escHtml(it.name) + '</span>'; }).join('') + '</div>'
                    : '<span style="color:#15803d;font-weight:600">Semua item sudah ada foto 🎉</span>') + '</div></div>';
}

function rkMonthLabel(m) {
  var names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  var p = m.split('-');
  return names[parseInt(p[1], 10) - 1] + ' ' + p[0];
}

// ── Kirim: upload foto baru satu per satu → simpan data ──
async function submitRak() {
  if (!_rk.store) { showToast('Verifikasi Plant Code terlebih dahulu.'); return; }
  var filled = _rk.items.filter(function(it) { return rkHasPhoto(it.key); });
  if (filled.length === 0) { showToast('⚠️ Belum ada foto. Upload minimal 1 aksesoris sebelum mengirim.'); return; }

  var btn = document.getElementById('btn-submit'), txt = document.getElementById('btn-submit-text');
  btn.disabled = true;

  var todo = _rk.items.filter(function(it) { return _rk.st[it.key].file; });
  var failed = 0;
  for (var i = 0; i < todo.length; i++) {
    var it = todo[i], s = _rk.st[it.key];
    txt.textContent = '⏳ Mengupload foto ' + (i + 1) + ' / ' + todo.length + '...';
    try {
      var res = await fetch(CONFIG.API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'uploadRakFoto', plantCode: _rk.store.code, storeName: _rk.store.name,
          itemKey: it.key, itemName: it.name, fileData: s.file.base64,
          fileName: it.key + '.jpg', meta: s.file.meta
        })
      });
      var raw = await res.text(), json;
      try { json = JSON.parse(raw); } catch (pe) { throw new Error('Respon server tidak valid'); }
      if (json.status !== 'success') throw new Error(json.message || 'Upload gagal');
      s.url = json.url; s.fileId = json.fileId || rkFileId(json.url); s.meta = json.meta || s.file.meta; s.file = null; s.err = '';
    } catch (err) {
      s.err = '❌ Upload gagal: ' + err.message;
      failed++;
    }
  }
  if (failed > 0) {
    renderItems();
    btn.disabled = false; txt.textContent = 'Kirim Rak Aksesoris';
    showToast('❌ ' + failed + ' foto gagal diupload. Foto lain sudah aman — tekan Kirim lagi untuk mengulang yang gagal.');
    var firstErr = document.querySelector('.rak-item.err'); if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  txt.textContent = '⏳ Menyimpan data...';
  try {
    var payload = {
      action: 'saveRakSamsung', plantCode: _rk.store.code, storeName: _rk.store.name,
      items: _rk.items.map(function(it) {
        var s = _rk.st[it.key], has = rkHasPhoto(it.key);
        return { key: it.key, name: it.name, target: it.target, types: it.types, ok: s.ok, qty: rkQty(it),
                 photoUrl: has ? s.url : '', fileId: has ? s.fileId : '', meta: has ? s.meta : null };
      })
    };
    var r2 = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
    var j2 = JSON.parse(await r2.text());
    if (j2.status !== 'success') throw new Error(j2.message || 'Gagal menyimpan');

    _rkSubmitted = true;
    document.getElementById('success-sub').textContent =
      _rk.store.name + ' · ' + j2.fotoCount + ' foto · Qty display ' + j2.qtyActual + '/' + j2.qtyTarget + ' model';
    document.getElementById('success-overlay').style.display = 'flex';
    updateProgress(4);
    renderItems();
  } catch (err) {
    showToast('❌ ' + err.message + '. Foto sudah terupload — tekan Kirim lagi.');
  }
  btn.disabled = false; txt.textContent = 'Kirim Rak Aksesoris';
}

function closeSuccess() {
  document.getElementById('success-overlay').style.display = 'none';
}

function resetForm() {
  _rk.store = null; _rk.items = []; _rk.st = {}; _rkSubmitted = false;
  document.getElementById('input-plant-code').value = '';
  document.getElementById('verify-result').style.display = 'none';
  document.getElementById('store-info').style.display = 'none';
  document.getElementById('prev-submit-banner').style.display = 'none';
  document.getElementById('success-overlay').style.display = 'none';
  document.getElementById('rak-list').innerHTML = '<div class="cl-empty">Verifikasi Plant Code terlebih dahulu</div>';
  document.getElementById('submit-summary').innerHTML = '';
  lockSteps();
  updateProgress(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showVerifyError(msg) {
  var el = document.getElementById('verify-result');
  el.className = 'verify-result verify-error';
  el.innerHTML = '⚠️ ' + msg;
  el.style.display = 'block';
  document.getElementById('store-info').style.display = 'none';
}

function unlockSteps() {
  document.getElementById('step-items').classList.remove('form-card--disabled');
  document.getElementById('step-submit').classList.remove('form-card--disabled');
  document.getElementById('btn-submit').disabled = false;
}
function lockSteps() {
  document.getElementById('step-items').classList.add('form-card--disabled');
  document.getElementById('step-submit').classList.add('form-card--disabled');
  document.getElementById('btn-submit').disabled = true;
  _rk.store = null;
}

function updateProgress(step) {
  var pct = step === 1 ? 10 : step === 2 ? 50 : step === 3 ? 80 : 100;
  var bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
}

function showToast(msg) {
  var toast = document.getElementById('error-toast'), el = document.getElementById('error-toast-msg');
  if (!toast) return;
  el.textContent = msg;
  toast.style.display = 'flex';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function() { toast.style.display = 'none'; }, 5000);
}
