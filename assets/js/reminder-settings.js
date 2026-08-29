// assets/js/reminder-settings.js — Auto Reminder Settings

var _slRows = [];
var _csRows = [];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function el(id) { return document.getElementById(id); }
function setMsg(id, text, ok) {
  el(id).innerHTML = text ? '<div class="' + (ok ? 'msg-ok' : 'msg-bad') + '">' + esc(text) + '</div>' : '';
}

async function post(payload) {
  var res = await fetch(CONFIG.API_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload)
  });
  return res.json();
}

// ── Load ──
async function loadSettings() {
  try {
    var url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', 'getReminderSettings');
    var json = await (await fetch(url.toString())).json();
    if (json.status !== 'success') throw new Error(json.message || 'Gagal memuat settings');

    el('token-status').textContent = json.hasToken ? 'Aktif ••' + (json.tokenTail || '') : 'Belum diset';
    el('token-status').style.background = json.hasToken ? '#dcfce7' : '#fee2e2';
    el('token-status').style.color = json.hasToken ? '#15803d' : '#b91c1c';
    el('fonnte-token').placeholder = json.hasToken ? 'Token tersimpan — isi untuk mengganti' : 'Tempel token device Fonnte di sini';

    var t = json.templates || {};
    el('tpl-l1').value = t.l1 || '';
    el('tpl-l2').value = t.l2 || '';
    el('tpl-l3').value = t.l3 || '';
    el('campaign-name').value = json.campaignName || '';

    var m = json.master || {};
    el('master-id').value = m.ssId || '';
    el('master-sheet').value = m.sheetName || '';
    el('master-header').value = m.headerRow || '';

    el('sl-count').textContent = (json.storeLeaderCount || 0) + ' toko';
    el('cs-count').textContent = (json.closedCount || 0) + ' toko';

    if (json.storeLeaderPreview && json.storeLeaderPreview.length) {
      renderPreview('sl-prev', json.storeLeaderPreview.map(function (o) {
        return [o.plant_code, o.store_name, o.store_leader, o.phone, o.city];
      }), ['Plant Code', 'Nama Toko', 'Store Leader', 'No HP', 'City'], 'Tersimpan di database:');
    }
    if (json.closedList && json.closedList.length) {
      renderPreview('cs-prev', json.closedList.map(function (o) { return [o.plant_code, o.store_name]; }),
        ['Plant Code', 'Nama Toko'], 'Tersimpan di database:');
    }
  } catch (err) {
    setMsg('token-msg', err.message, false);
  }
}

// ── Fonnte token ──
async function saveToken() {
  var token = el('fonnte-token').value.trim();
  if (!token) { setMsg('token-msg', 'Isi token dulu.', false); return; }
  el('btn-token').disabled = true;
  try {
    var json = await post({ action: 'saveFonnteToken', token: token });
    if (json.status !== 'success') throw new Error(json.message || 'Gagal menyimpan');
    el('fonnte-token').value = '';
    setMsg('token-msg', 'Token tersimpan.', true);
    loadSettings();
  } catch (err) { setMsg('token-msg', err.message, false); }
  el('btn-token').disabled = false;
}

// ── Templates ──
async function saveTemplates() {
  el('btn-tpl').disabled = true;
  try {
    var json = await post({
      action: 'saveReminderSettings',
      campaignName: el('campaign-name').value,
      templates: { l1: el('tpl-l1').value, l2: el('tpl-l2').value, l3: el('tpl-l3').value }
    });
    if (json.status !== 'success') throw new Error(json.message || 'Gagal menyimpan');
    setMsg('tpl-msg', 'Template tersimpan.', true);
  } catch (err) { setMsg('tpl-msg', err.message, false); }
  el('btn-tpl').disabled = false;
}

// ── Master Toko ──
async function saveMaster() {
  el('btn-master').disabled = true;
  try {
    var json = await post({
      action: 'saveReminderSettings',
      master: { ssId: el('master-id').value, sheetName: el('master-sheet').value, headerRow: el('master-header').value }
    });
    if (json.status !== 'success') throw new Error(json.message || 'Gagal menyimpan');
    setMsg('master-msg', 'Master Toko tersimpan.', true);
  } catch (err) { setMsg('master-msg', err.message, false); }
  el('btn-master').disabled = false;
}

async function testMaster() {
  el('btn-master-test').disabled = true;
  setMsg('master-msg', 'Menguji koneksi...', true);
  try {
    // simpan dulu supaya server pakai config terbaru, lalu baca
    await post({
      action: 'saveReminderSettings',
      master: { ssId: el('master-id').value, sheetName: el('master-sheet').value, headerRow: el('master-header').value }
    });
    var url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', 'getReminderData');
    var json = await (await fetch(url.toString())).json();
    if (json.status !== 'success') throw new Error(json.message || 'Gagal fetch');
    setMsg('master-msg', 'OK — ' + json.count + ' toko belum submit terbaca dari sumber ini.', true);
  } catch (err) { setMsg('master-msg', err.message, false); }
  el('btn-master-test').disabled = false;
}

// ── Excel parsing ──
var COLS = {
  plantCode:   ['plant code', 'plantcode', 'kode toko', 'kode', 'plant'],
  storeName:   ['nama toko', 'store name', 'nama store', 'nama', 'store', 'toko'],
  storeLeader: ['store leader', 'storeleader', 'nama sl', 'leader', 'pic toko', 'pic', 'sl'],
  phone:       ['no hp', 'nohp', 'nomor hp', 'no telp', 'no telepon', 'phone', 'whatsapp', 'telp', 'handphone', 'hp', 'wa'],
  city:        ['city', 'kota'],
  region:      ['region', 'regional', 'area']
};

function normHeader(h) {
  return String(h == null ? '' : h).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}
function findCol(headers, cands) {
  for (var i = 0; i < headers.length; i++) {
    if (cands.indexOf(headers[i]) >= 0) return i;
  }
  for (var k = 0; k < headers.length; k++) {
    for (var j = 0; j < cands.length; j++) if (headers[k] && headers[k].indexOf(cands[j]) >= 0) return k;
  }
  return -1;
}
function findHeaderRow(aoa) {
  for (var i = 0; i < Math.min(aoa.length, 15); i++) {
    var joined = (aoa[i] || []).map(function (c) { return normHeader(c); }).join('|');
    if (/plant code|kode toko|plantcode/.test(joined)) return i;
  }
  return 0;
}

function parseFile(input, kind) {
  var file = input.files && input.files[0];
  if (!file) return;
  var msgId = kind === 'sl' ? 'sl-msg' : 'cs-msg';
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      var hr = findHeaderRow(aoa);
      var headers = (aoa[hr] || []).map(normHeader);
      var iPc = findCol(headers, COLS.plantCode);
      var iNm = findCol(headers, COLS.storeName);
      if (iPc < 0) throw new Error('Kolom "Plant Code" tidak ditemukan di file.');

      var rows = [];
      if (kind === 'sl') {
        var iSl = findCol(headers, COLS.storeLeader);
        var iPh = findCol(headers, COLS.phone);
        var iCt = findCol(headers, COLS.city);
        var iRg = findCol(headers, COLS.region);
        for (var r = hr + 1; r < aoa.length; r++) {
          var row = aoa[r] || [];
          var pc = String(row[iPc] || '').toUpperCase().trim();
          if (!pc) continue;
          rows.push({
            plantCode: pc,
            storeName: iNm >= 0 ? String(row[iNm] || '').trim() : '',
            storeLeader: iSl >= 0 ? String(row[iSl] || '').trim() : '',
            phone: iPh >= 0 ? String(row[iPh] || '').trim() : '',
            city: iCt >= 0 ? String(row[iCt] || '').trim() : '',
            region: iRg >= 0 ? String(row[iRg] || '').trim() : ''
          });
        }
        _slRows = rows;
        renderPreview('sl-prev', rows.slice(0, 50).map(function (o) {
          return [o.plantCode, o.storeName, o.storeLeader, o.phone, o.city];
        }), ['Plant Code', 'Nama Toko', 'Store Leader', 'No HP', 'City'], rows.length + ' baris siap disimpan:');
        el('btn-sl').disabled = rows.length === 0;
        setMsg(msgId, rows.length + ' baris terbaca dari ' + file.name, true);
      } else {
        for (var r2 = hr + 1; r2 < aoa.length; r2++) {
          var row2 = aoa[r2] || [];
          var pc2 = String(row2[iPc] || '').toUpperCase().trim();
          if (!pc2) continue;
          rows.push({ plantCode: pc2, storeName: iNm >= 0 ? String(row2[iNm] || '').trim() : '' });
        }
        _csRows = rows;
        renderPreview('cs-prev', rows.slice(0, 50).map(function (o) { return [o.plantCode, o.storeName]; }),
          ['Plant Code', 'Nama Toko'], rows.length + ' baris siap disimpan:');
        el('btn-cs').disabled = rows.length === 0;
        setMsg(msgId, rows.length + ' baris terbaca dari ' + file.name, true);
      }
    } catch (err) {
      setMsg(msgId, err.message, false);
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderPreview(targetId, rows, headers, caption) {
  if (!rows.length) { el(targetId).innerHTML = ''; return; }
  var html = '<div class="hint">' + esc(caption || '') + '</div><div class="prev-wrap"><table class="prev-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + esc(c || '—') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  el(targetId).innerHTML = html;
}

async function saveStoreLeaders() {
  if (!_slRows.length) return;
  el('btn-sl').disabled = true;
  try {
    var json = await post({ action: 'saveStoreLeaders', rows: _slRows });
    if (json.status !== 'success') throw new Error(json.message || 'Gagal menyimpan');
    setMsg('sl-msg', json.count + ' Store Leader tersimpan di database.', true);
    _slRows = [];
    el('sl-file').value = '';
    loadSettings();
  } catch (err) { setMsg('sl-msg', err.message, false); el('btn-sl').disabled = false; }
}

async function saveClosedStores() {
  if (!_csRows.length) return;
  el('btn-cs').disabled = true;
  try {
    var json = await post({ action: 'saveClosedStores', rows: _csRows });
    if (json.status !== 'success') throw new Error(json.message || 'Gagal menyimpan');
    setMsg('cs-msg', json.count + ' toko tutup tersimpan di database.', true);
    _csRows = [];
    el('cs-file').value = '';
    loadSettings();
  } catch (err) { setMsg('cs-msg', err.message, false); el('btn-cs').disabled = false; }
}

document.addEventListener('DOMContentLoaded', loadSettings);
