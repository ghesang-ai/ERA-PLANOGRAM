// assets/js/submit.js
// Custom Web Form — ERA-PLANOGRAM LDU Input

// ── Brand groups ──
var BRAND_GROUPS = {
  smartphone: [
    'Apple','Samsung','Oppo','Vivo','Xiaomi','Infinix',
    'Honor','Realme','Tecno','Sharp','IQOO','Huawei','Motorola','Advan'
  ],
  laptop: [
    'Apple Macbook','Acer Laptop','Asus Laptop','HP Laptop',
    'Huawei Laptop','Lenovo Laptop','Others Laptop'
  ],
  ce: [
    'Samsung CE','Xiaomi CE','Infinix CE','Toshiba CE','LG CE',
    'Polytron CE','Sharp CE','TCL CE','Sony CE','Changhong CE'
  ],
  accessories: [
    'Accesories C-Brand'
  ]
};

var _verifiedStore = null; // { 'Plant Code', 'Store Name', 'Region', 'Status', 'Last Submit' }
var _lduValues     = {};   // { Apple: 0, Samsung: 2, ... }

// ── Init ──
document.addEventListener('DOMContentLoaded', function() {
  buildBrandGrids();
  updateProgress(1);

  // Enter key on Plant Code input triggers verify
  var pcInput = document.getElementById('input-plant-code');
  if (pcInput) {
    pcInput.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') verifyPlantCode();
      this.value = this.value.toUpperCase();
    });
  }
});

// ── Build all brand input grids ──
function buildBrandGrids() {
  Object.keys(BRAND_GROUPS).forEach(function(key) {
    var grid = document.getElementById('grid-' + key);
    if (!grid) return;

    grid.innerHTML = BRAND_GROUPS[key].map(function(brand) {
      var id = 'ldu-' + sanitizeId(brand);
      _lduValues[brand] = 0;
      return '<div class="brand-input-card">' +
        '<label class="brand-input-label" for="' + id + '">' + escHtml(brand) + '</label>' +
        '<input type="number" id="' + id + '" class="brand-input-field" ' +
          'value="0" min="0" max="999" ' +
          'data-brand="' + escHtml(brand) + '" ' +
          'oninput="onLduInput(this)" onchange="onLduInput(this)">' +
      '</div>';
    }).join('');
  });
}

function sanitizeId(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── LDU input handler ──
function onLduInput(input) {
  var brand = input.getAttribute('data-brand');
  var val   = parseInt(input.value) || 0;
  if (val < 0) { val = 0; input.value = 0; }
  _lduValues[brand] = val;

  // Toggle highlight on non-zero
  input.parentElement.classList.toggle('has-value', val > 0);

  updateLduTotal();
  updateSubmitSummary();
}

function updateLduTotal() {
  var total = Object.values(_lduValues).reduce(function(s, v) { return s + v; }, 0);
  var badge = document.getElementById('ldu-total-badge');
  if (badge) {
    badge.textContent = 'Total: ' + total + ' unit';
    badge.classList.toggle('badge-has-value', total > 0);
  }
}

// ── Step 1: Verify Plant Code ──
function verifyPlantCode() {
  var input     = document.getElementById('input-plant-code');
  var resultEl  = document.getElementById('verify-result');
  var storeInfo = document.getElementById('store-info');
  var btnVerify = document.getElementById('btn-verify');

  var plantCode = (input.value || '').trim().toUpperCase();
  if (!plantCode) {
    showVerifyError('Masukkan Plant Code terlebih dahulu.');
    return;
  }

  // Loading state
  btnVerify.disabled = true;
  btnVerify.textContent = '⏳';
  resultEl.style.display = 'none';
  storeInfo.style.display = 'none';

  var url = new URL(CONFIG.API_URL);
  url.searchParams.set('store', plantCode);

  fetch(url.toString())
    .then(function(r) { return r.json(); })
    .then(function(json) {
      btnVerify.disabled = false;
      btnVerify.textContent = 'Verifikasi';

      if (json.status !== 'success' || !Array.isArray(json.data) || json.data.length === 0) {
        showVerifyError('Plant Code <strong>' + escHtml(plantCode) + '</strong> tidak ditemukan. Pastikan kode sesuai dengan data toko.');
        lockLduStep();
        return;
      }

      var store = json.data[0];
      _verifiedStore = store;

      // Fill store info card
      document.getElementById('info-store-name').textContent  = store['Store Name'] || '-';
      document.getElementById('info-plant-code').textContent  = store['Plant Code'] || '-';
      document.getElementById('info-region').textContent      = store['Region'] || '-';

      var brandToko = CONFIG.detectBrandToko(store['Store Name']);
      var pill = document.getElementById('info-brand-pill');
      pill.textContent = brandToko;
      pill.style.background = (CONFIG.BRAND_TOKO_COLORS[brandToko] || '#64748b') + '22';
      pill.style.color       = CONFIG.BRAND_TOKO_COLORS[brandToko] || '#64748b';
      pill.style.borderColor = CONFIG.BRAND_TOKO_COLORS[brandToko] || '#64748b';

      var lastSubmit = store['Status'] === 'Submitted'
        ? '📅 Terakhir submit: ' + CONFIG.formatDate(store['Last Submit'])
        : '⏳ Belum pernah submit';
      document.getElementById('info-last-submit').textContent = lastSubmit;

      // Pre-fill existing values
      CONFIG.BRAND_LDU_COLUMNS.forEach(function(brand) {
        var val = parseInt(store[brand]) || 0;
        _lduValues[brand] = val;
        var input = document.getElementById('ldu-' + sanitizeId(brand));
        if (input) {
          input.value = val;
          input.parentElement.classList.toggle('has-value', val > 0);
        }
      });

      storeInfo.style.display = 'flex';
      resultEl.style.display  = 'none';

      // Unlock step 2 & 3
      unlockLduStep();
      updateLduTotal();
      updateSubmitSummary();
      updateProgress(2);

      // Smooth scroll to step 2
      setTimeout(function() {
        document.getElementById('step-ldu').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    })
    .catch(function(err) {
      btnVerify.disabled = false;
      btnVerify.textContent = 'Verifikasi';
      showVerifyError('Gagal menghubungi server. Cek koneksi internet dan coba lagi.');
      console.error(err);
    });
}

function showVerifyError(msg) {
  var el = document.getElementById('verify-result');
  el.className = 'verify-result verify-error';
  el.innerHTML = '⚠️ ' + msg;
  el.style.display = 'block';
}

function unlockLduStep() {
  document.getElementById('step-ldu').classList.remove('form-card--disabled');
  document.getElementById('step-submit').classList.remove('form-card--disabled');
  document.getElementById('btn-submit').disabled = false;
}

function lockLduStep() {
  document.getElementById('step-ldu').classList.add('form-card--disabled');
  document.getElementById('step-submit').classList.add('form-card--disabled');
  document.getElementById('btn-submit').disabled = true;
  _verifiedStore = null;
}

// ── Update submit summary ──
function updateSubmitSummary() {
  if (!_verifiedStore) return;
  var summary = document.getElementById('submit-summary');
  if (!summary) return;

  var total     = Object.values(_lduValues).reduce(function(s, v) { return s + v; }, 0);
  var brandList = Object.keys(_lduValues).filter(function(b) { return _lduValues[b] > 0; });

  var brandHtml = brandList.length > 0
    ? brandList.map(function(b) {
        return '<span class="summary-brand-chip">' + escHtml(b) + ': <strong>' + _lduValues[b] + '</strong></span>';
      }).join('')
    : '<span style="color:var(--gray-400)">Semua brand = 0 unit</span>';

  summary.innerHTML =
    '<div class="summary-row">' +
      '<div class="summary-label">Toko</div>' +
      '<div class="summary-value"><strong>' + escHtml(_verifiedStore['Store Name']) + '</strong></div>' +
    '</div>' +
    '<div class="summary-row">' +
      '<div class="summary-label">Plant Code</div>' +
      '<div class="summary-value"><code>' + escHtml(_verifiedStore['Plant Code']) + '</code></div>' +
    '</div>' +
    '<div class="summary-row">' +
      '<div class="summary-label">Total LDU</div>' +
      '<div class="summary-value"><strong style="font-size:20px;color:var(--blue)">' + total + '</strong> unit</div>' +
    '</div>' +
    '<div class="summary-row summary-row--brands">' +
      '<div class="summary-label">Brand ada LDU</div>' +
      '<div class="summary-value summary-brands">' + brandHtml + '</div>' +
    '</div>';
}

// ── Submit form ──
function submitForm() {
  if (!_verifiedStore) {
    showToast('Verifikasi Plant Code terlebih dahulu.');
    return;
  }

  var btnSubmit = document.getElementById('btn-submit');
  var btnText   = document.getElementById('btn-submit-text');

  // Loading state
  btnSubmit.disabled = true;
  btnText.textContent = '⏳ Mengirim data...';

  // Build payload
  var payload = { 'Plant Code': _verifiedStore['Plant Code'] };
  CONFIG.BRAND_LDU_COLUMNS.forEach(function(brand) {
    payload[brand] = _lduValues[brand] || 0;
  });

  // POST to Apps Script
  fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // text/plain avoids CORS preflight
    body: JSON.stringify(payload),
    redirect: 'follow'
  })
  .then(function(r) { return r.json(); })
  .then(function(json) {
    btnSubmit.disabled = false;
    btnText.textContent = '📤 Kirim Data LDU';

    if (json.status === 'success') {
      var total = Object.values(_lduValues).reduce(function(s, v) { return s + v; }, 0);
      document.getElementById('success-sub').textContent =
        _verifiedStore['Store Name'] + ' · ' + total + ' unit LDU berhasil disimpan.';
      document.getElementById('success-overlay').style.display = 'flex';
      updateProgress(3);
    } else {
      showToast('Gagal menyimpan: ' + (json.message || 'Error tidak diketahui'));
    }
  })
  .catch(function(err) {
    btnSubmit.disabled = false;
    btnText.textContent = '📤 Kirim Data LDU';
    showToast('Gagal menghubungi server. Cek koneksi internet.');
    console.error(err);
  });
}

// ── Reset form untuk input toko lain ──
function resetForm() {
  _verifiedStore = null;

  document.getElementById('input-plant-code').value = '';
  document.getElementById('verify-result').style.display = 'none';
  document.getElementById('store-info').style.display    = 'none';
  document.getElementById('success-overlay').style.display = 'none';

  // Reset all LDU inputs
  CONFIG.BRAND_LDU_COLUMNS.forEach(function(brand) {
    _lduValues[brand] = 0;
    var input = document.getElementById('ldu-' + sanitizeId(brand));
    if (input) {
      input.value = 0;
      input.parentElement.classList.remove('has-value');
    }
  });

  lockLduStep();
  updateLduTotal();
  updateProgress(1);

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Progress bar ──
function updateProgress(step) {
  var pct = step === 1 ? 10 : step === 2 ? 55 : 100;
  var bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
}

// ── Toast notification ──
function showToast(msg) {
  var toast = document.getElementById('error-toast');
  var msgEl = document.getElementById('error-toast-msg');
  if (!toast) return;
  msgEl.textContent = msg;
  toast.style.display = 'flex';
  setTimeout(function() { toast.style.display = 'none'; }, 4000);
}
