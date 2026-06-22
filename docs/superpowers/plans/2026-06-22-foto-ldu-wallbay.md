# Foto LDU & Wallbay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah fitur upload Foto LDU Display & Wallbay per brand di form Input LDU, simpan ke Google Drive, tampilkan di dashboard Store Detail.

**Architecture:** Step 3 baru di submit.html menampilkan accordion per brand (hanya brand dengan device terpilih). Foto di-compress client-side lalu di-upload satu per satu ke Apps Script via doPost → disimpan ke Google Drive dengan struktur bulan/toko. URL foto disimpan ke Google Sheets via doPost saveFotoUrls. Dashboard store-detail.html menampilkan Tab "Foto" dengan gallery 2-kolom (LDU + Wallbay) per brand.

**Tech Stack:** Vanilla JS (FileReader, Canvas compress), Google Apps Script (DriveApp), Google Sheets, Netlify static.

**Folder Drive Root ID:** `1LG9I2fhm3YY6rNUpRUBOHjP6dCQ0FeXc`

---

## File Map

| File | Aksi |
|---|---|
| `apps-script/Code.gs` | Tambah `uploadFotoToDrive()`, `saveFotoUrls()`, update `doPost` |
| `assets/js/foto-upload.js` | File baru — compress, upload, accordion render |
| `assets/js/submit.js` | Tambah `showFotoStep()`, `submitWithFoto()`, `skipFoto()` |
| `submit.html` | Tambah Step 3 HTML (accordion foto) |
| `assets/js/store-detail.js` | Tambah `renderFotoTab()`, tab switching |
| `store-detail.html` | Tambah tab row + tab-foto div |
| `assets/css/style.css` | Tambah styles foto accordion, gallery, tab |

---

## Task 1: Apps Script — Upload Foto ke Drive

**Files:**
- Modify: `apps-script/Code.gs`

- [ ] **Step 1: Tambah konstanta Drive folder ID**

Di atas `const SHEET_NAME = 'ERA-PLANOGRAM';`, tambahkan:

```javascript
const SHEET_NAME = 'ERA-PLANOGRAM';
const FOTO_ROOT_FOLDER_ID = '1LG9I2fhm3YY6rNUpRUBOHjP6dCQ0FeXc';
```

- [ ] **Step 2: Tambah fungsi `getOrCreateFolder`**

Tambah setelah `testUpdateOneRow`:

```javascript
// ── Helper: get folder by name, buat jika belum ada ──
function getOrCreateFolder(parentFolder, name) {
  var iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(name);
}
```

- [ ] **Step 3: Tambah fungsi `uploadFotoToDrive`**

```javascript
// ── Upload foto ke Drive, return web view URL ──
// payload: { plantCode, storeName, brand, type, fileData, fileName }
// fileData: "data:image/jpeg;base64,/9j/..." 
function uploadFotoToDrive(payload) {
  var plantCode = (payload.plantCode || '').toUpperCase().trim();
  var storeName = (payload.storeName || plantCode).trim();
  var brand     = (payload.brand || '').trim();
  var type      = (payload.type || '').trim();   // "LDU" atau "Wallbay"
  var fileData  = payload.fileData || '';
  var fileName  = payload.fileName || (brand + '_' + type + '.jpg');

  // Strip data URL prefix
  var base64 = fileData.replace(/^data:image\/\w+;base64,/, '');
  var blob   = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', fileName);

  // Buat struktur folder: root → bulan → toko
  var root       = DriveApp.getFolderById(FOTO_ROOT_FOLDER_ID);
  var now        = new Date();
  var monthName  = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM MMMM');
  var folderName = plantCode + ' ' + storeName;

  var monthFolder = getOrCreateFolder(root, monthName);
  var tokoFolder  = getOrCreateFolder(monthFolder, folderName);

  // Hapus file lama dengan nama sama jika ada (overwrite)
  var existing = tokoFolder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  // Upload file baru
  var file = tokoFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    status: 'success',
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    fileId: file.getId()
  };
}
```

- [ ] **Step 4: Tambah fungsi `saveFotoUrls`**

```javascript
// ── Simpan URL foto ke kolom sheet ──
// payload: { plantCode, fotoMap: { "Apple_LDU_Foto": "https://...", ... } }
function saveFotoUrls(payload) {
  var plantCode = (payload.plantCode || '').toUpperCase().trim();
  var fotoMap   = payload.fotoMap || {};

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tidak ditemukan');

  var lastCol  = sheet.getLastColumn();
  var lastRow  = sheet.getLastRow();
  var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Build headerMap (case-insensitive)
  var headerMap = {};
  headers.forEach(function(h, i) {
    if (h) headerMap[h.toString().trim()] = i + 1;
  });

  // Cari baris toko
  var allRows   = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRow = -1;
  for (var i = 0; i < allRows.length; i++) {
    if (allRows[i][0].toString().trim().toUpperCase() === plantCode) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) throw new Error('Plant Code tidak ditemukan: ' + plantCode);

  // Untuk setiap key di fotoMap, cari atau buat kolom
  Object.keys(fotoMap).forEach(function(colName) {
    var colIdx = headerMap[colName];
    if (!colIdx) {
      // Kolom belum ada — tambah di akhir
      lastCol++;
      sheet.getRange(1, lastCol).setValue(colName);
      headerMap[colName] = lastCol;
      colIdx = lastCol;
    }
    sheet.getRange(targetRow, colIdx).setValue(fotoMap[colName] || '');
  });

  return { status: 'success', updated: Object.keys(fotoMap).length };
}
```

- [ ] **Step 5: Update `doPost` untuk handle action foto**

Ganti isi `doPost` dengan:

```javascript
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'submit';

    if (action === 'uploadFoto') {
      var result = uploadFotoToDrive(body);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveFotoUrls') {
      var result = saveFotoUrls(body);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Default: submit checklist (existing logic)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);

    const plantCode = (body['Plant Code'] || '').toString().trim().toUpperCase();
    if (!plantCode) throw new Error('Plant Code kosong');

    const formData = {};
    Object.keys(body).forEach(function(k) {
      formData[k] = [body[k] !== undefined ? body[k].toString() : '0'];
    });

    const result = updateMasterSheet(sheet, formData, plantCode);
    if (!result.success) throw new Error(result.reason);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Data berhasil disimpan untuk ' + plantCode
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

- [ ] **Step 6: Copy-paste ke Apps Script editor dan re-deploy**

1. Buka [script.google.com](https://script.google.com), pilih project ERA-PLANOGRAM
2. Hapus semua isi editor, paste isi `apps-script/Code.gs` yang sudah diupdate
3. Klik **Deploy → Manage Deployments → Edit (pensil) → New Version → Deploy**
4. Test manual: jalankan `testUploadFoto` di editor:

```javascript
function testUploadFoto() {
  // Buat fake base64 1x1 pixel JPEG
  var fakeBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC AABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwAB/9k=';
  var result = uploadFotoToDrive({
    plantCode: 'TEST',
    storeName: 'Test Store',
    brand: 'Apple',
    type: 'LDU',
    fileData: fakeBase64,
    fileName: 'Apple_LDU_test.jpg'
  });
  Logger.log(JSON.stringify(result));
}
```

Expected log: `{"status":"success","url":"https://drive.google.com/file/d/...","fileId":"..."}`

- [ ] **Step 7: Commit**

```bash
git add apps-script/Code.gs
git commit -m "feat: Apps Script — uploadFotoToDrive + saveFotoUrls"
```

---

## Task 2: CSS — Styles Foto Accordion & Gallery

**Files:**
- Modify: `assets/css/style.css` (tambah di bagian akhir, sebelum `@media`)

- [ ] **Step 1: Tambah styles foto accordion di submit form**

Tambah sebelum `@media (max-width: 1100px)`:

```css
/* ── FOTO STEP ── */
.foto-accordion { display: flex; flex-direction: column; gap: 8px; }
.foto-brand-item { border: 1.5px solid var(--gray-200); border-radius: 10px; overflow: hidden; }
.foto-brand-header {
  padding: 10px 14px; background: var(--gray-50);
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; user-select: none;
}
.foto-brand-header:hover { background: var(--gray-100); }
.foto-brand-name { font-size: 13px; font-weight: 700; color: var(--gray-800); }
.foto-brand-body { padding: 12px 14px; background: white; border-top: 1px solid var(--gray-100); }
.foto-type-section { margin-bottom: 12px; }
.foto-type-section:last-child { margin-bottom: 0; }
.foto-type-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
}
.foto-type-label--ldu   { color: var(--blue); }
.foto-type-label--wall  { color: var(--green); }
.foto-type-label .dot   { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.foto-type-label--ldu .dot  { background: var(--blue); }
.foto-type-label--wall .dot { background: var(--green); }
.foto-upload-zone {
  display: flex; align-items: center; gap: 10px;
}
.foto-preview-thumb {
  width: 80px; height: 60px; border-radius: 8px; overflow: hidden;
  border: 2px solid var(--gray-200); flex-shrink: 0; background: var(--gray-100);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; position: relative;
}
.foto-preview-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.foto-preview-thumb .thumb-placeholder { font-size: 22px; color: var(--gray-400); }
.foto-preview-thumb:hover { border-color: var(--blue); }
.foto-upload-btn-wrap { display: flex; flex-direction: column; gap: 6px; }
.foto-upload-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--blue-light); color: var(--blue);
  border: 1.5px solid #bfdbfe; border-radius: 8px;
  padding: 6px 12px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: var(--font);
}
.foto-upload-btn:hover { background: #dbeafe; }
.foto-upload-info { font-size: 11px; color: var(--gray-400); }
.foto-badge-count {
  background: var(--green-light); color: var(--green);
  font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px;
}
.foto-badge-zero { color: var(--gray-400); font-size: 11px; }

/* ── GALLERY FOTO di Store Detail ── */
.foto-gallery { display: flex; flex-direction: column; gap: 12px; }
.foto-gallery-brand-card {
  background: white; border-radius: 12px; padding: 14px;
  box-shadow: var(--shadow); border: 1px solid var(--gray-200);
}
.foto-gallery-brand-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.foto-gallery-brand-name { font-size: 13px; font-weight: 700; color: var(--gray-800); }
.foto-cols { display: flex; gap: 12px; }
.foto-col { flex: 1; }
.foto-col-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
.foto-col-label.ldu  { color: var(--blue); }
.foto-col-label.wall { color: var(--green); }
.foto-img-frame {
  border-radius: 8px; overflow: hidden; aspect-ratio: 4/3;
  border: 1.5px solid var(--gray-200);
  display: flex; align-items: center; justify-content: center;
  background: var(--gray-50); cursor: pointer;
}
.foto-img-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.foto-img-frame:hover img { opacity: .9; }
.foto-img-empty { font-size: 11px; color: var(--gray-400); text-align: center; }
.foto-img-date { font-size: 10px; color: var(--gray-400); margin-top: 4px; }

/* Tab row di store-detail */
.detail-tab-row { display: flex; gap: 6px; margin-bottom: 16px; }
.detail-tab {
  padding: 7px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
  cursor: pointer; border: 1.5px solid var(--gray-200); background: white; color: var(--gray-600);
  font-family: var(--font);
}
.detail-tab.active { background: var(--blue); color: white; border-color: var(--blue); }
```

- [ ] **Step 2: Tambah responsive CSS di dalam `@media (max-width: 768px)`**

Tambah di dalam blok `@media (max-width: 768px)` yang sudah ada:

```css
  .foto-cols { flex-direction: column; }
  .foto-preview-thumb { width: 70px; height: 52px; }
```

- [ ] **Step 3: Commit**

```bash
git add assets/css/style.css
git commit -m "feat: CSS foto accordion, gallery, tab styles"
```

---

## Task 3: foto-upload.js — File Baru

**Files:**
- Create: `assets/js/foto-upload.js`

- [ ] **Step 1: Buat file foto-upload.js**

```javascript
// assets/js/foto-upload.js
// Tanggung jawab: compress foto, render accordion, upload ke Apps Script

var _fotoData = {};
// _fotoData = { "Apple_LDU": { file, base64, previewUrl }, "Apple_Wallbay": {...} }

// Compress image file ke max maxKB, return base64 data URL
function compressImage(file, maxKB, callback) {
  var maxKB = maxKB || 800;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var MAX_W = 1200;
      var w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      var quality = 0.85;
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      // Reduce quality if still too large
      while (dataUrl.length > maxKB * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Render accordion Step 3 — hanya brand dengan device terpilih
// brandsWithCount: [ { name: "Apple", count: 8 }, ... ]
function buildFotoAccordion(brandsWithCount) {
  _fotoData = {};
  var container = document.getElementById('foto-accordion');
  if (!container) return;

  if (!brandsWithCount || brandsWithCount.length === 0) {
    container.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:8px 0">Pilih device di Step 2 terlebih dahulu.</p>';
    return;
  }

  container.innerHTML = brandsWithCount.map(function(b) {
    var key = b.name.replace(/\s+/g, '_');
    return '<div class="foto-brand-item" id="fbi-' + key + '">' +
      '<div class="foto-brand-header" onclick="toggleFotoAccordion(\'' + key + '\')">' +
        '<span class="foto-brand-name">' + escHtml(b.name) + ' <span style="color:var(--gray-400);font-weight:400;font-size:11px">(' + b.count + ' device)</span></span>' +
        '<span id="fbadge-' + key + '" class="foto-badge-zero">0 foto</span>' +
      '</div>' +
      '<div class="foto-brand-body" id="fbbody-' + key + '" style="display:none">' +
        renderFotoTypeZone(b.name, 'LDU') +
        renderFotoTypeZone(b.name, 'Wallbay') +
      '</div>' +
    '</div>';
  }).join('');
}

function renderFotoTypeZone(brand, type) {
  var key = brand.replace(/\s+/g, '_') + '_' + type;
  var labelClass = type === 'LDU' ? 'foto-type-label--ldu' : 'foto-type-label--wall';
  var icon = type === 'LDU' ? '📺' : '🗂️';
  return '<div class="foto-type-section">' +
    '<div class="foto-type-label ' + labelClass + '"><span class="dot"></span>' + icon + ' FOTO ' + type.toUpperCase() + ' DISPLAY</div>' +
    '<div class="foto-upload-zone">' +
      '<div class="foto-preview-thumb" id="fthumb-' + key + '" onclick="document.getElementById(\'finput-' + key + '\').click()">' +
        '<span class="thumb-placeholder">📷</span>' +
      '</div>' +
      '<div class="foto-upload-btn-wrap">' +
        '<label class="foto-upload-btn" for="finput-' + key + '">📁 Pilih Foto</label>' +
        '<input type="file" id="finput-' + key + '" accept="image/*" capture="environment" style="display:none" ' +
          'onchange="onFotoSelect(\'' + brand + '\',\'' + type + '\',this)">' +
        '<div class="foto-upload-info" id="finfo-' + key + '">JPG/PNG · Max 5MB</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function toggleFotoAccordion(key) {
  var body = document.getElementById('fbbody-' + key);
  if (!body) return;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function onFotoSelect(brand, type, input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var key = brand.replace(/\s+/g, '_') + '_' + type;
  var infoEl = document.getElementById('finfo-' + key);
  var thumbEl = document.getElementById('fthumb-' + key);

  if (infoEl) infoEl.textContent = '⏳ Memproses...';

  compressImage(file, 800, function(base64) {
    var sizeKB = Math.round(base64.length * 0.75 / 1024);
    _fotoData[brand + '_' + type] = { base64: base64, brand: brand, type: type };
    if (thumbEl) thumbEl.innerHTML = '<img src="' + base64 + '" alt="">';
    if (infoEl) infoEl.textContent = '✅ ' + sizeKB + 'KB — siap upload';
    updateFotoBadge(brand);
  });
}

function updateFotoBadge(brand) {
  var key = brand.replace(/\s+/g, '_');
  var count = Object.keys(_fotoData).filter(function(k) { return k.startsWith(brand + '_'); }).length;
  var badge = document.getElementById('fbadge-' + key);
  if (!badge) return;
  if (count > 0) {
    badge.className = 'foto-badge-count';
    badge.textContent = count + ' foto';
  } else {
    badge.className = 'foto-badge-zero';
    badge.textContent = '0 foto';
  }
}

// Upload semua foto ke Drive, return map { "Apple_LDU_Foto": "url", ... }
async function uploadAllFotos(plantCode, storeName) {
  var keys = Object.keys(_fotoData);
  if (keys.length === 0) return {};

  var fotoMap = {};
  for (var i = 0; i < keys.length; i++) {
    var entry = _fotoData[keys[i]];
    var brand  = entry.brand;
    var type   = entry.type;
    var today  = new Date();
    var ymd    = today.getFullYear() +
                 String(today.getMonth()+1).padStart(2,'0') +
                 String(today.getDate()).padStart(2,'0');
    var fileName = brand.replace(/\s+/g,'_') + '_' + type + '_' + ymd + '.jpg';
    var colName  = brand + '_' + type + '_Foto';

    try {
      var res = await fetch(CONFIG.API_URL.replace('/exec','') + '/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'uploadFoto',
          plantCode: plantCode,
          storeName: storeName,
          brand: brand,
          type: type,
          fileData: entry.base64,
          fileName: fileName
        })
      });
      var json = await res.json();
      if (json.status === 'success') {
        fotoMap[colName] = json.url;
      }
    } catch (err) {
      console.warn('Upload foto gagal:', brand, type, err);
    }
  }
  return fotoMap;
}

// Simpan URL foto ke Sheets
async function saveFotoUrlsToSheet(plantCode, fotoMap) {
  if (Object.keys(fotoMap).length === 0) return;
  try {
    await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveFotoUrls',
        plantCode: plantCode,
        fotoMap: fotoMap
      })
    });
  } catch (err) {
    console.warn('saveFotoUrls gagal:', err);
  }
}

// Hitung total foto yang sudah dipilih
function getFotoCount() {
  return Object.keys(_fotoData).length;
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/foto-upload.js
git commit -m "feat: foto-upload.js — compress, accordion, upload helpers"
```

---

## Task 4: submit.html — Step 3 HTML

**Files:**
- Modify: `submit.html`

- [ ] **Step 1: Tambah script foto-upload.js di akhir body**

Cari baris:
```html
<script src="assets/js/submit.js"></script>
```

Ubah menjadi:
```html
<script src="assets/js/foto-upload.js"></script>
<script src="assets/js/submit.js"></script>
```

- [ ] **Step 2: Tambah Step 3 HTML sebelum `<!-- SUBMIT BUTTON -->`**

Cari bagian `id="step-submit"` atau tombol submit. Tambah Step 3 tepat sebelumnya:

```html
<!-- STEP 3: FOTO LDU & WALLBAY -->
<div class="form-card form-card--disabled" id="step-foto">
  <div class="form-card-header">
    <div class="step-circle" id="step3-circle">3</div>
    <div>
      <div class="form-card-title">Foto LDU &amp; Wallbay</div>
      <div class="form-card-sub">Upload foto display dan wallbay per brand · Opsional</div>
    </div>
    <span class="badge badge-yellow" style="margin-left:auto">Opsional</span>
  </div>
  <div class="form-card-body" id="step-foto-body" style="display:none">
    <p style="font-size:12px;color:var(--gray-400);margin-bottom:14px">
      Hanya brand dengan device terpilih di Step 2 yang ditampilkan.
    </p>
    <div id="foto-accordion"></div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="skipFoto()" style="flex:1">
        Lewati →
      </button>
      <button class="btn btn-blue" onclick="submitWithFoto()" style="flex:2" id="btn-submit-foto">
        <span id="btn-foto-text">📤 Submit dengan Foto</span>
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Pastikan badge-yellow ada di CSS**

Di `assets/css/style.css`, cek apakah `.badge-yellow` sudah ada. Jika belum, tambah:

```css
.badge-yellow { background: #fef3c7; color: #92400e; }
```

- [ ] **Step 4: Commit**

```bash
git add submit.html assets/css/style.css
git commit -m "feat: submit.html — Step 3 foto accordion HTML"
```

---

## Task 5: submit.js — Wire Step 3

**Files:**
- Modify: `assets/js/submit.js`

- [ ] **Step 1: Tambah fungsi `showFotoStep`**

Tambah setelah fungsi `updateProgress`:

```javascript
// Tampilkan Step 3 Foto — bangun accordion dari brand yang terpilih
function showFotoStep() {
  var step = document.getElementById('step-foto');
  var body = document.getElementById('step-foto-body');
  if (!step || !body) { skipFoto(); return; }

  // Kumpulkan brand + count dari checklist Step 2
  var brandMap = {};
  CONFIG.BRAND_LDU_COLUMNS.forEach(function(col) {
    brandMap[col.toUpperCase()] = col;
  });
  var brandCount = {};
  var checkedIdx = Object.keys(_checked).filter(function(k) { return _checked[k]; });
  checkedIdx.forEach(function(k) {
    var d = _allDevices[parseInt(k)];
    if (d) {
      var col = brandMap[(d.brand || '').toUpperCase()] || d.brand;
      brandCount[col] = (brandCount[col] || 0) + 1;
    }
  });
  _newItems.forEach(function(it) {
    var col = brandMap[(it.brand || '').toUpperCase()] || it.brand;
    brandCount[col] = (brandCount[col] || 0) + 1;
  });

  // Hanya brand dengan device terpilih
  var brandsWithCount = Object.keys(brandCount)
    .filter(function(b) { return brandCount[b] > 0; })
    .map(function(b) { return { name: b, count: brandCount[b] }; });

  // Aktifkan step-foto
  step.classList.remove('form-card--disabled');
  body.style.display = 'block';
  step.scrollIntoView({ behavior: 'smooth', block: 'start' });
  updateProgress(2.5);

  buildFotoAccordion(brandsWithCount);
}
```

- [ ] **Step 2: Update `submitChecklist` — panggil `showFotoStep` sebagai ganti submit langsung**

Di fungsi `submitChecklist`, cari baris:
```javascript
  var submitUrl = new URL(CONFIG.API_URL);
  submitUrl.searchParams.set('action', 'submit');
```

Ganti seluruh bagian dari baris itu sampai akhir fungsi dengan:

```javascript
  // Simpan brandCount ke window untuk dipakai submitWithFoto
  window._pendingBrandCount = brandCount;
  window._pendingPlantCode  = plantCode;
  window._pendingCheckedLen = checkedIdx.length;

  // Re-enable tombol submit sebelum lanjut ke step foto
  btnSubmit.disabled = false;
  btnText.textContent = '📤 Kirim Checklist LDU';

  showFotoStep();
}
```

- [ ] **Step 3: Tambah fungsi `skipFoto` dan `submitWithFoto`**

```javascript
function skipFoto() {
  doActualSubmit({});
}

async function submitWithFoto() {
  var btn  = document.getElementById('btn-submit-foto');
  var txt  = document.getElementById('btn-foto-text');
  btn.disabled = true;

  var fotoCount = getFotoCount();
  if (fotoCount > 0) {
    txt.textContent = '⏳ Upload ' + fotoCount + ' foto...';
    var storeName = _verifiedStore ? (_verifiedStore['Store Name'] || '') : '';
    var fotoMap = await uploadAllFotos(window._pendingPlantCode, storeName);
    doActualSubmit(fotoMap);
  } else {
    doActualSubmit({});
  }
  btn.disabled = false;
  txt.textContent = '📤 Submit dengan Foto';
}

function doActualSubmit(fotoMap) {
  var plantCode  = window._pendingPlantCode;
  var brandCount = window._pendingBrandCount || {};

  var submitUrl = new URL(CONFIG.API_URL);
  submitUrl.searchParams.set('action', 'submit');
  submitUrl.searchParams.set('store', plantCode);
  CONFIG.BRAND_LDU_COLUMNS.forEach(function(brand) {
    submitUrl.searchParams.set(brand, brandCount[brand] || 0);
  });

  fetch(submitUrl.toString())
    .then(function(r) { return r.json(); })
    .then(async function(json) {
      if (json.status === 'success') {
        // Simpan foto URLs ke sheet jika ada
        if (Object.keys(fotoMap).length > 0) {
          await saveFotoUrlsToSheet(plantCode, fotoMap);
        }
        var checkedLen = window._pendingCheckedLen || 0;
        document.getElementById('success-sub').textContent =
          (_verifiedStore ? _verifiedStore['Store Name'] : plantCode) +
          ' · ' + checkedLen + ' device' +
          (Object.keys(fotoMap).length > 0 ? ' · ' + Object.keys(fotoMap).length + ' foto' : '');
        var detailBtn = document.getElementById('btn-see-detail');
        if (detailBtn) detailBtn.href = 'store-detail.html?code=' + encodeURIComponent(plantCode);
        document.getElementById('success-overlay').style.display = 'flex';
        updateProgress(3);
      } else {
        showToast('❌ Gagal: ' + (json.message || 'Unknown error'));
      }
    })
    .catch(function(err) {
      showToast('❌ Error: ' + err.message);
    });
}
```

- [ ] **Step 4: Commit**

```bash
git add assets/js/submit.js
git commit -m "feat: submit.js — showFotoStep, submitWithFoto, doActualSubmit"
```

---

## Task 6: Store Detail — Tab Foto

**Files:**
- Modify: `store-detail.html`
- Modify: `assets/js/store-detail.js`

- [ ] **Step 1: Tambah tab row dan tab-foto div di store-detail.html**

Cari:
```html
<!-- GRID LDU PER BRAND -->
<div class="section">
  <div class="section-title">Jumlah Unit LDU per Brand</div>
  <div class="ldu-grid" id="ldu-grid">
```

Ganti dengan:
```html
<!-- TAB ROW -->
<div class="section">
  <div class="detail-tab-row">
    <button class="detail-tab active" id="tab-btn-ldu" onclick="setDetailTab('ldu')">📊 LDU Count</button>
    <button class="detail-tab" id="tab-btn-foto" onclick="setDetailTab('foto')">📸 Foto LDU &amp; Wallbay</button>
  </div>

  <!-- TAB: LDU GRID -->
  <div id="tab-ldu">
    <div class="section-title">Jumlah Unit LDU per Brand</div>
    <div class="ldu-grid" id="ldu-grid">
      <div style="color:var(--gray-400)">Memuat...</div>
    </div>
  </div>

  <!-- TAB: FOTO GALLERY -->
  <div id="tab-foto" style="display:none">
    <div class="section-title">Foto LDU &amp; Wallbay</div>
    <div class="foto-gallery" id="foto-gallery">
      <div style="color:var(--gray-400);font-size:13px">Memuat foto...</div>
    </div>
  </div>
</div>
```

**Hapus** div lama:
```html
<!-- GRID LDU PER BRAND -->
<div class="section">
  <div class="section-title">Jumlah Unit LDU per Brand</div>
  <div class="ldu-grid" id="ldu-grid">
    <div style="color:var(--gray-400)">Memuat...</div>
  </div>
</div>
```

- [ ] **Step 2: Tambah fungsi di store-detail.js**

Tambah di akhir file:

```javascript
function setDetailTab(tab) {
  document.getElementById('tab-ldu').style.display  = tab === 'ldu'  ? '' : 'none';
  document.getElementById('tab-foto').style.display = tab === 'foto' ? '' : 'none';
  document.getElementById('tab-btn-ldu').className  = 'detail-tab' + (tab === 'ldu'  ? ' active' : '');
  document.getElementById('tab-btn-foto').className = 'detail-tab' + (tab === 'foto' ? ' active' : '');
}

function renderFotoTab(row) {
  var container = document.getElementById('foto-gallery');
  if (!container) return;

  // Kumpulkan brand yang punya kolom foto
  var brands = CONFIG.BRAND_LDU_COLUMNS.filter(function(brand) {
    return row[brand + '_LDU_Foto'] || row[brand + '_Wallbay_Foto'];
  });

  if (brands.length === 0) {
    container.innerHTML = '<div style="color:var(--gray-400);font-size:13px;padding:12px 0">' +
      '📷 Belum ada foto untuk toko ini.<br>' +
      '<small>Upload foto melalui form Input LDU pada saat submit.</small></div>';
    return;
  }

  container.innerHTML = brands.map(function(brand) {
    var lduUrl  = row[brand + '_LDU_Foto']  || '';
    var wallUrl = row[brand + '_Wallbay_Foto'] || '';

    var lduHtml = lduUrl
      ? '<a href="' + escHtml(lduUrl) + '" target="_blank" rel="noopener"><div class="foto-img-frame"><img src="' + escHtml(lduUrl.replace('/view','') + '?export=view') + '" alt="LDU ' + escHtml(brand) + '" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=foto-img-empty>Klik untuk buka</div>\'"></div></a>'
      : '<div class="foto-img-frame"><div class="foto-img-empty">Belum ada foto</div></div>';

    var wallHtml = wallUrl
      ? '<a href="' + escHtml(wallUrl) + '" target="_blank" rel="noopener"><div class="foto-img-frame"><img src="' + escHtml(wallUrl.replace('/view','') + '?export=view') + '" alt="Wallbay ' + escHtml(brand) + '" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=foto-img-empty>Klik untuk buka</div>\'"></div></a>'
      : '<div class="foto-img-frame"><div class="foto-img-empty">Belum ada foto</div></div>';

    return '<div class="foto-gallery-brand-card">' +
      '<div class="foto-gallery-brand-header">' +
        '<div class="foto-gallery-brand-name">' + escHtml(brand) + '</div>' +
        '<span style="font-size:10px;color:var(--gray-400)">' + (lduUrl ? '📺 ' : '') + (wallUrl ? '🗂️' : '') + '</span>' +
      '</div>' +
      '<div class="foto-cols">' +
        '<div class="foto-col"><div class="foto-col-label ldu">📺 LDU Display</div>' + lduHtml + '</div>' +
        '<div class="foto-col"><div class="foto-col-label wall">🗂️ Wallbay</div>' + wallHtml + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}
```

- [ ] **Step 3: Panggil `renderFotoTab` di `renderStoreDetail`**

Di `store-detail.js`, di dalam fungsi `renderStoreDetail`, tambah setelah `document.getElementById('ldu-grid').innerHTML = gridHtml;`:

```javascript
  renderFotoTab(row);
```

- [ ] **Step 4: Commit**

```bash
git add store-detail.html assets/js/store-detail.js
git commit -m "feat: store-detail — tab foto gallery per brand"
```

---

## Task 7: Deploy & Test End-to-End

**Files:** tidak ada perubahan kode

- [ ] **Step 1: Push ke GitHub**

```bash
git push origin main
```

Tunggu ~1 menit Netlify deploy.

- [ ] **Step 2: Test upload foto di form**

1. Buka `era-planogram.netlify.app/submit.html`
2. Input Plant Code → Verifikasi
3. Pilih beberapa device di Step 2 → lihat summary muncul
4. Step 3 terbuka otomatis — accordion per brand yang dipilih
5. Klik salah satu brand → expand
6. Pilih foto untuk zona LDU → thumbnail muncul, badge "1 foto"
7. Pilih foto untuk zona Wallbay → badge "2 foto"
8. Klik "Submit dengan Foto"
9. Loading "Upload 2 foto..." → sukses overlay muncul

- [ ] **Step 3: Verifikasi Google Drive**

Buka Google Drive → folder `ERA-PLANOGRAM` → cek:
```
ERA-PLANOGRAM/
└── 2026-06 Juni/
    └── {PlantCode} {StoreName}/
        ├── Apple_LDU_20260622.jpg  ← ada!
        └── Apple_Wallbay_20260622.jpg  ← ada!
```

- [ ] **Step 4: Verifikasi Google Sheets**

Buka sheet ERA-PLANOGRAM → scroll ke kolom paling kanan:
- Kolom baru `Apple_LDU_Foto` berisi URL Drive → klik → foto terbuka
- Kolom baru `Apple_Wallbay_Foto` berisi URL Drive

- [ ] **Step 5: Test dashboard Store Detail**

1. Buka `era-planogram.netlify.app`
2. Klik toko yang baru disubmit
3. Tab "📸 Foto LDU & Wallbay" → klik
4. Gallery muncul: 2 kolom per brand (LDU + Wallbay)
5. Klik foto → buka di tab baru

- [ ] **Step 6: Test "Lewati" (skip foto)**

1. Submit toko lain, di Step 3 klik "Lewati →"
2. Langsung success overlay, tanpa upload foto
3. Sheets tidak ada kolom foto baru untuk toko ini (atau kolom kosong)

---

## Catatan Penting untuk Deploy Apps Script

Setiap kali `Code.gs` diubah, **wajib re-deploy** dengan versi baru:
1. Apps Script editor → Deploy → Manage Deployments
2. Edit (ikon pensil) → Version: **New Version** → Deploy
3. URL deploy **tidak berubah** — tidak perlu update `config.js`
