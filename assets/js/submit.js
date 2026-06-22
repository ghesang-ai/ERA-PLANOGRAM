// assets/js/submit.js — ERA-PLANOGRAM Checklist LDU Form

var _verifiedStore    = null;
var _allDevices       = [];
var _checked          = {};
var _status           = {};
var _notes            = {};
var _newItems         = [];
var _deviceData       = null;
var _pendingBrandCount  = {};
var _pendingStatusCount = {};
var _pendingPlantCode   = '';
var _pendingStoreName   = '';

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', function() {
  updateProgress(1);
  loadDeviceData();
  var pcInput = document.getElementById('input-plant-code');
  if (pcInput) {
    pcInput.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') verifyPlantCode();
      this.value = this.value.toUpperCase();
    });
  }
});

function loadDeviceData() {
  fetch('assets/data/ldu-devices.json')
    .then(function(r) { return r.json(); })
    .then(function(data) { _deviceData = data; })
    .catch(function(err) { console.warn('Device data load failed:', err); });
}

function verifyPlantCode() {
  var input     = document.getElementById('input-plant-code');
  var resultEl  = document.getElementById('verify-result');
  var storeInfo = document.getElementById('store-info');
  var btnVerify = document.getElementById('btn-verify');
  var plantCode = (input.value || '').trim().toUpperCase();
  if (!plantCode) { showVerifyError('Masukkan Plant Code terlebih dahulu.'); return; }

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
        showVerifyError('Plant Code <strong>' + escHtml(plantCode) + '</strong> tidak ditemukan.');
        lockLduStep();
        return;
      }

      var store = json.data[0];
      _verifiedStore = store;

      document.getElementById('info-store-name').textContent = store['Store Name'] || '-';
      document.getElementById('info-plant-code').textContent = store['Plant Code'] || '-';
      document.getElementById('info-region').textContent     = store['Region'] || '-';

      var brandToko = CONFIG.detectBrandToko(store['Store Name']);
      var pill = document.getElementById('info-brand-pill');
      pill.textContent      = brandToko;
      pill.style.background = (CONFIG.BRAND_TOKO_COLORS[brandToko] || '#64748b') + '22';
      pill.style.color      = CONFIG.BRAND_TOKO_COLORS[brandToko] || '#64748b';
      pill.style.borderColor= CONFIG.BRAND_TOKO_COLORS[brandToko] || '#64748b';

      _allDevices = [];
      _checked    = {};
      _notes      = {};
      _newItems   = [];

      if (_deviceData && _deviceData[plantCode]) {
        _allDevices = _deviceData[plantCode].devices || [];
      }

      var devCount = _allDevices.length;
      document.getElementById('info-device-count').textContent =
        devCount > 0 ? '📦 ' + devCount + ' device terdaftar' : '⏳ Belum ada data device';

      storeInfo.style.display = 'flex';
      resultEl.style.display  = 'none';

      buildBrandFilter();
      renderChecklist();
      updateTotalBadge();
      updateSubmitSummary();
      unlockLduStep();
      updateProgress(2);

      setTimeout(function() {
        document.getElementById('step-ldu').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    })
    .catch(function(err) {
      btnVerify.disabled = false;
      btnVerify.textContent = 'Verifikasi';
      showVerifyError('Gagal menghubungi server. Cek koneksi dan coba lagi.');
      console.error(err);
    });
}

function buildBrandFilter() {
  var brands = [];
  _allDevices.forEach(function(d) {
    if (d.brand && brands.indexOf(d.brand) === -1) brands.push(d.brand);
  });
  brands.sort();
  var sel = document.getElementById('cl-brand');
  sel.innerHTML = '<option value="">Semua Brand (' + _allDevices.length + ')</option>';
  brands.forEach(function(b) {
    var count = _allDevices.filter(function(d) { return d.brand === b; }).length;
    var opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b + ' (' + count + ')';
    sel.appendChild(opt);
  });
}

function renderChecklist() {
  var q = (document.getElementById('cl-search').value || '').toLowerCase();
  var b = document.getElementById('cl-brand').value;

  var filtered = _allDevices.filter(function(d) {
    if (b && d.brand !== b) return false;
    if (q && !d.name.toLowerCase().includes(q) && !(d.sn || '').toLowerCase().includes(q)) return false;
    return true;
  });

  document.getElementById('cl-count').textContent = filtered.length + ' device';

  var html = '';
  if (filtered.length === 0 && _allDevices.length === 0) {
    html = '<div class="cl-empty">Tidak ada data device untuk toko ini</div>';
  } else if (filtered.length === 0) {
    html = '<div class="cl-empty">Tidak ada device ditemukan</div>';
  } else {
    html = filtered.map(function(d) {
      var i    = _allDevices.indexOf(d);
      var ok   = !!_checked[i];
      var st   = _status[i] || null;
      var note = _notes[i] || '';
      var bp   = 'bp-' + d.brand.replace(/\s+/g, '-');

      var statusRow = '';
      if (ok) {
        statusRow =
          '<div class="cl-status-row">' +
            '<span class="cl-status-label">Status:</span>' +
            '<button class="cl-status-btn' + (st === 'display' ? ' s-display' : '') + '" ' +
              'onclick="event.stopPropagation();setDeviceStatus(' + i + ',\'display\')">Display</button>' +
            '<button class="cl-status-btn' + (st === 'tidak' ? ' s-tidak' : '') + '" ' +
              'onclick="event.stopPropagation();setDeviceStatus(' + i + ',\'tidak\')">Tidak Display</button>' +
            '<button class="cl-status-btn' + (st === 'rusak' ? ' s-rusak' : '') + '" ' +
              'onclick="event.stopPropagation();setDeviceStatus(' + i + ',\'rusak\')">Rusak</button>' +
          '</div>';
      }

      return '<div class="cl-item' + (ok ? ' cl-checked' : '') + '">' +
        '<div class="cl-item-top" onclick="toggleDevice(' + i + ')">' +
          '<div class="cl-checkbox"><span class="cl-check-icon">✓</span></div>' +
          '<div class="cl-item-info">' +
            '<div class="cl-item-name">' + escHtml(d.name) + '</div>' +
            '<div class="cl-item-sn">SN: ' + escHtml(d.sn || '-') + '</div>' +
          '</div>' +
          '<span class="cl-brand-pill ' + bp + '">' + escHtml(d.brand) + '</span>' +
        '</div>' +
        statusRow +
        '<div class="cl-item-note-row">' +
          '<span class="cl-note-label">✏️ Catatan:</span>' +
          '<input class="cl-note-input" type="text" ' +
            'placeholder="Kondisi, lokasi display, keterangan lain..." ' +
            'value="' + escHtml(note) + '" ' +
            'data-idx="' + i + '" ' +
            'oninput="onNoteInput(this)" ' +
            'onclick="event.stopPropagation()">' +
        '</div>' +
      '</div>';
    }).join('');
  }

  document.getElementById('checklist-device-list').innerHTML = html;
  updateTotalBadge();

  var totalChecked = Object.keys(_checked).filter(function(k) { return _checked[k]; }).length;
  var btnAll = document.getElementById('btn-check-all');
  if (btnAll) {
    var allDone = _allDevices.length > 0 && totalChecked === _allDevices.length;
    btnAll.textContent = allDone ? 'Batal Semua' : 'Centang Semua';
    btnAll.classList.toggle('all-checked', allDone);
  }
}

function onNoteInput(input) {
  var i = parseInt(input.getAttribute('data-idx'));
  _notes[i] = input.value;
  updateSubmitSummary();
}

function toggleDevice(i) {
  _checked[i] = !_checked[i];
  if (!_checked[i]) _status[i] = null;
  renderChecklist();
  updateSubmitSummary();
}

function setDeviceStatus(i, s) {
  if (!_checked[i]) return;
  _status[i] = (_status[i] === s) ? null : s;
  renderChecklist();
  updateSubmitSummary();
}

function toggleCheckAll() {
  var totalChecked = Object.keys(_checked).filter(function(k) { return _checked[k]; }).length;
  if (totalChecked === _allDevices.length) {
    _checked = {};
  } else {
    _allDevices.forEach(function(_, i) { _checked[i] = true; });
  }
  renderChecklist();
  updateSubmitSummary();
}

function addNewItem() {
  var nameInput  = document.getElementById('new-item-name');
  var brandInput = document.getElementById('new-item-brand');
  var name = (nameInput.value || '').trim();
  if (!name) { nameInput.focus(); return; }
  _newItems.push({ name: name, brand: brandInput.value, note: '' });
  nameInput.value = '';
  renderNewItems();
  updateSubmitSummary();
}

function deleteNewItem(i) {
  _newItems.splice(i, 1);
  renderNewItems();
  updateSubmitSummary();
}

function renderNewItems() {
  var container = document.getElementById('new-items-list');
  if (!container) return;
  container.innerHTML = _newItems.map(function(item, i) {
    return '<div class="new-item-row">' +
      '<span class="new-item-icon">✦</span>' +
      '<span class="new-item-name">' + escHtml(item.name) + '</span>' +
      '<span class="cl-brand-pill bp-NEW">' + escHtml(item.brand) + '</span>' +
      '<input class="new-item-note-input" type="text" placeholder="Catatan..." ' +
        'value="' + escHtml(item.note) + '" ' +
        'data-newidx="' + i + '" ' +
        'oninput="_newItems[parseInt(this.getAttribute(\'data-newidx\'))].note=this.value">' +
      '<button class="btn-del-new" onclick="deleteNewItem(' + i + ')">×</button>' +
    '</div>';
  }).join('');
}

function updateTotalBadge() {
  var totalChecked = Object.keys(_checked).filter(function(k) { return _checked[k]; }).length;
  var badge = document.getElementById('ldu-total-badge');
  if (badge) {
    badge.textContent = totalChecked + ' / ' + _allDevices.length + ' device';
    badge.classList.toggle('badge-has-value', totalChecked > 0);
  }
}

function updateSubmitSummary() {
  if (!_verifiedStore) return;
  var summary = document.getElementById('submit-summary');
  if (!summary) return;

  var checkedIdx = Object.keys(_checked).filter(function(k) { return _checked[k]; });
  var totalChecked = checkedIdx.length;

  var brandCount = {};
  checkedIdx.forEach(function(k) {
    var d = _allDevices[parseInt(k)];
    if (d) brandCount[d.brand] = (brandCount[d.brand] || 0) + 1;
  });
  _newItems.forEach(function(it) {
    var key = it.brand + ' (baru)';
    brandCount[key] = (brandCount[key] || 0) + 1;
  });

  var totalDisplay = 0, totalTidak = 0, totalRusak = 0;
  checkedIdx.forEach(function(k) {
    var st = _status[parseInt(k)] || null;
    if (st === 'display') totalDisplay++;
    else if (st === 'tidak') totalTidak++;
    else if (st === 'rusak') totalRusak++;
  });

  var brandHtml = Object.keys(brandCount).length > 0
    ? Object.keys(brandCount).map(function(b) {
        return '<span class="summary-brand-chip">' + escHtml(b) + ': <strong>' + brandCount[b] + '</strong></span>';
      }).join('')
    : '<span style="color:var(--gray-400)">Belum ada device tercentang</span>';

  summary.innerHTML =
    '<div class="summary-row"><div class="summary-label">Toko</div>' +
      '<div class="summary-value"><strong>' + escHtml(_verifiedStore['Store Name']) + '</strong></div></div>' +
    '<div class="summary-row"><div class="summary-label">Plant Code</div>' +
      '<div class="summary-value"><code>' + escHtml(_verifiedStore['Plant Code']) + '</code></div></div>' +
    '<div class="summary-row"><div class="summary-label">Device Tercentang</div>' +
      '<div class="summary-value"><strong style="font-size:18px;color:var(--blue)">' + totalChecked + '</strong>' +
      ' dari ' + _allDevices.length + ' device terdaftar</div></div>' +
    (_newItems.length > 0
      ? '<div class="summary-row"><div class="summary-label">Item Baru</div>' +
        '<div class="summary-value"><strong style="color:#7c3aed">' + _newItems.length + '</strong> item ditambahkan</div></div>'
      : '') +
    '<div class="summary-row"><div class="summary-label">Status Kondisi</div>' +
      '<div class="summary-value">' +
        '<span class="summary-status-chip s-display">Display: <strong>' + totalDisplay + '</strong></span>' +
        '<span class="summary-status-chip s-tidak">Tidak Display: <strong>' + totalTidak + '</strong></span>' +
        '<span class="summary-status-chip s-rusak">Rusak: <strong>' + totalRusak + '</strong></span>' +
      '</div></div>' +
    '<div class="summary-row"><div class="summary-label">Per Brand</div>' +
      '<div class="summary-value summary-brand-chips">' + brandHtml + '</div></div>';
}

function submitChecklist() {
  if (!_verifiedStore) { showToast('Verifikasi Plant Code terlebih dahulu.'); return; }

  var plantCode  = _verifiedStore['Plant Code'];
  var checkedIdx = Object.keys(_checked).filter(function(k) { return _checked[k]; });

  var missingStatus = checkedIdx.filter(function(k) { return !_status[parseInt(k)]; });
  if (missingStatus.length > 0) {
    showToast('⚠️ ' + missingStatus.length + ' device belum dipilih statusnya (Display / Tidak Display / Rusak).');
    var firstIdx = parseInt(missingStatus[0]);
    var d = _allDevices[firstIdx];
    if (d) {
      document.getElementById('cl-search').value = d.name.substring(0, 10);
      renderChecklist();
    }
    return;
  }

  var brandMap = {};
  CONFIG.BRAND_LDU_COLUMNS.forEach(function(col) { brandMap[col.toUpperCase()] = col; });

  var brandCount = {};
  checkedIdx.forEach(function(k) {
    var d = _allDevices[parseInt(k)];
    if (d) {
      var colName = brandMap[(d.brand || '').toUpperCase()] || d.brand;
      brandCount[colName] = (brandCount[colName] || 0) + 1;
    }
  });
  _newItems.forEach(function(it) {
    var colName = brandMap[(it.brand || '').toUpperCase()] || it.brand;
    brandCount[colName] = (brandCount[colName] || 0) + 1;
  });

  var statusCount = {};
  _allDevices.forEach(function(d, i) {
    var colName = brandMap[(d.brand || '').toUpperCase()] || d.brand;
    if (!statusCount[colName]) statusCount[colName] = { display: 0, tidak: 0, rusak: 0 };
    if (_checked[i]) {
      var st = _status[i] || 'tidak';
      statusCount[colName][st]++;
    } else {
      statusCount[colName]['tidak']++;
    }
  });
  _newItems.forEach(function(it) {
    var colName = brandMap[(it.brand || '').toUpperCase()] || it.brand;
    if (!statusCount[colName]) statusCount[colName] = { display: 0, tidak: 0, rusak: 0 };
    statusCount[colName]['display']++;
  });

  _pendingBrandCount  = brandCount;
  _pendingStatusCount = statusCount;
  _pendingPlantCode   = plantCode;
  _pendingStoreName   = _verifiedStore['Store Name'] || '';

  showFotoStep(brandCount);
}

function showFotoStep(brandCount) {
  var brandsWithCount = Object.keys(brandCount).map(function(b) {
    return { name: b, count: brandCount[b] };
  });

  buildFotoAccordion(brandsWithCount);

  var stepFoto = document.getElementById('step-foto');
  var body     = document.getElementById('step-foto-body');
  stepFoto.classList.remove('form-card--disabled');
  body.style.display = 'block';
  updateProgress(3);

  setTimeout(function() {
    stepFoto.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

function skipFoto() {
  doActualSubmit({});
}

async function submitWithFoto() {
  var btn  = document.getElementById('btn-submit-foto');
  var text = document.getElementById('btn-foto-text');
  btn.disabled = true;
  text.textContent = '⏳ Mengupload foto...';

  var fotoMap = await uploadAllFotos(_pendingPlantCode, _pendingStoreName);
  doActualSubmit(fotoMap);
}

function doActualSubmit(fotoMap) {
  var btnSubmit = document.getElementById('btn-submit');
  var btnText   = document.getElementById('btn-submit-text');
  if (btnSubmit) { btnSubmit.disabled = true; }
  if (btnText)   { btnText.textContent = '⏳ Mengirim data...'; }

  var submitUrl = new URL(CONFIG.API_URL);
  submitUrl.searchParams.set('action', 'submit');
  submitUrl.searchParams.set('store', _pendingPlantCode);
  CONFIG.BRAND_LDU_COLUMNS.forEach(function(brand) {
    submitUrl.searchParams.set(brand, _pendingBrandCount[brand] || 0);
    var sc = _pendingStatusCount[brand] || {};
    submitUrl.searchParams.set(brand + '_Display',      sc.display || 0);
    submitUrl.searchParams.set(brand + '_TidakDisplay', sc.tidak   || 0);
    submitUrl.searchParams.set(brand + '_Rusak',        sc.rusak   || 0);
  });

  var checkedIdx = Object.keys(_checked).filter(function(k) { return _checked[k]; });

  fetch(submitUrl.toString())
    .then(function(r) { return r.json(); })
    .then(async function(json) {
      if (btnSubmit) { btnSubmit.disabled = false; }
      if (btnText)   { btnText.textContent = '📤 Kirim Checklist LDU'; }

      if (json.status === 'success') {
        if (fotoMap && Object.keys(fotoMap).length > 0) {
          await saveFotoUrlsToSheet(_pendingPlantCode, fotoMap);
        }
        document.getElementById('success-sub').textContent =
          _pendingStoreName + ' · ' + checkedIdx.length + ' device tercentang' +
          (_newItems.length > 0 ? ' · ' + _newItems.length + ' item baru' : '') +
          (Object.keys(fotoMap || {}).length > 0 ? ' · ' + Object.keys(fotoMap).length + ' foto' : '');
        var detailBtn = document.getElementById('btn-see-detail');
        if (detailBtn) detailBtn.href = 'store-detail.html?code=' + encodeURIComponent(_pendingPlantCode);
        document.getElementById('success-overlay').style.display = 'flex';
        updateProgress(4);
      } else {
        showToast('❌ ' + (json.message || 'Gagal menyimpan data. Coba lagi.'));
        var btn = document.getElementById('btn-submit-foto');
        if (btn) btn.disabled = false;
        var text = document.getElementById('btn-foto-text');
        if (text) text.textContent = '📤 Submit dengan Foto';
      }
    })
    .catch(function(err) {
      if (btnSubmit) { btnSubmit.disabled = false; }
      if (btnText)   { btnText.textContent = '📤 Kirim Checklist LDU'; }
      var btn = document.getElementById('btn-submit-foto');
      if (btn) btn.disabled = false;
      var text = document.getElementById('btn-foto-text');
      if (text) text.textContent = '📤 Submit dengan Foto';
      showToast('Gagal menghubungi server. Cek koneksi internet.');
      console.error(err);
    });
}

function resetForm() {
  _verifiedStore      = null;
  _allDevices         = [];
  _checked            = {};
  _status             = {};
  _notes              = {};
  _newItems           = [];
  _pendingBrandCount  = {};
  _pendingStatusCount = {};
  _pendingPlantCode   = '';
  _pendingStoreName   = '';

  var fotoBody = document.getElementById('step-foto-body');
  if (fotoBody) fotoBody.style.display = 'none';
  document.getElementById('step-foto').classList.add('form-card--disabled');
  var accordion = document.getElementById('foto-accordion');
  if (accordion) accordion.innerHTML = '';
  var btn = document.getElementById('btn-submit-foto');
  if (btn) btn.disabled = false;
  var text = document.getElementById('btn-foto-text');
  if (text) text.textContent = '📤 Submit dengan Foto';

  document.getElementById('input-plant-code').value = '';
  document.getElementById('verify-result').style.display   = 'none';
  document.getElementById('store-info').style.display      = 'none';
  document.getElementById('success-overlay').style.display = 'none';
  document.getElementById('checklist-device-list').innerHTML = '<div class="cl-empty">Verifikasi Plant Code terlebih dahulu</div>';
  document.getElementById('new-items-list').innerHTML = '';
  document.getElementById('submit-summary').innerHTML = '';

  lockLduStep();
  updateTotalBadge();
  updateProgress(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  document.getElementById('step-foto').classList.add('form-card--disabled');
  document.getElementById('step-submit').classList.add('form-card--disabled');
  document.getElementById('btn-submit').disabled = true;
  _verifiedStore = null;
}

function updateProgress(step) {
  var pct = step === 1 ? 10 : step === 2 ? 45 : step === 3 ? 75 : 100;
  var bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
}

function showToast(msg) {
  var toast = document.getElementById('error-toast');
  var msgEl = document.getElementById('error-toast-msg');
  if (!toast) return;
  msgEl.textContent = msg;
  toast.style.display = 'flex';
  setTimeout(function() { toast.style.display = 'none'; }, 4000);
}
