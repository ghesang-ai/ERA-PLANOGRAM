# Foto LDU & Wallbay — Design Spec

**Goal:** Tambah fitur upload foto LDU Display dan Wallbay per brand di form Input LDU. Foto disimpan ke Google Drive, URL disimpan di Google Sheets, ditampilkan di dashboard Store Detail.

**Architecture:** Step 3 baru di submit.html (accordion per brand, 2 zona foto: LDU + Wallbay). Apps Script upload foto ke Google Drive via DriveApp, buat folder otomatis per bulan dan per toko. URL foto disimpan di Sheets sebagai kolom `{Brand}_LDU_Foto` dan `{Brand}_Wallbay_Foto`. Dashboard store-detail.html tampilkan tab Foto dengan gallery 2-kolom per brand.

**Tech Stack:** Vanilla JS (FileReader, FormData), Google Apps Script (DriveApp), Google Sheets, Netlify static hosting.

---

## Google Drive

- **Root Folder ID:** `1LG9I2fhm3YY6rNUpRUBOHjP6dCQ0FeXc`
- **Struktur folder:**
  ```
  ERA-PLANOGRAM/ (root)
  └── 2026-06 Juni/          ← dibuat otomatis oleh Apps Script
      └── E281 Erafone Senayan City/   ← dibuat otomatis
          ├── Apple_LDU_20260622.jpg
          ├── Apple_Wallbay_20260622.jpg
          ├── Samsung_LDU_20260622.jpg
          └── Samsung_Wallbay_20260622.jpg
  ```
- File naming: `{Brand}_{Type}_{YYYYMMDD}.jpg`
- Folder bulan format: `YYYY-MM MMM` (e.g. `2026-06 Juni`)
- Jika file sudah ada (re-submit), overwrite dengan file baru

---

## Google Sheets — Kolom Baru

Untuk setiap brand di `BRAND_LDU_COLUMNS`, tambah 2 kolom di akhir sheet:
- `{Brand}_LDU_Foto` — URL Google Drive file LDU foto
- `{Brand}_Wallbay_Foto` — URL Google Drive file Wallbay foto

Brands: Apple, Samsung, Oppo, Xiaomi, Huawei, Realme, Vivo, Nokia, Infinix, Tecno, Itel, Advan, Evercoss, Polytron, Lenovo, Motorola, Sony, HMD, Honor, Wiko, ZTE, Coolpad, Leeco, Meizu, OnePlus, Poco, iQOO, Redmi, Narzo, Spark, Pop, Note (sesuai BRAND_LDU_COLUMNS di config.js)

Value: URL string `https://drive.google.com/file/d/{fileId}/view` atau kosong `""`.

---

## Apps Script (Code.gs)

### Fungsi baru: `uploadFotoToDrive(payload)`

```
Input payload (dari doPost):
{
  action: "uploadFoto",
  plantCode: "E281",
  storeName: "Erafone Senayan City",
  brand: "Apple",
  type: "LDU",          // atau "Wallbay"
  fileData: "<base64>", // data:image/jpeg;base64,...
  fileName: "Apple_LDU_20260622.jpg"
}

Output:
{
  status: "success",
  url: "https://drive.google.com/file/d/xxx/view"
}
```

### Logic:
1. Parse `fileData` (strip `data:image/...;base64,` prefix)
2. Decode base64 → Blob
3. Get/create folder: root → `YYYY-MM MMM` → `{plantCode} {storeName}`
4. Create/overwrite file di folder toko
5. Set file permission: `anyone with link can view`
6. Return `webViewLink`

### `doPost` update:
- Tambah handler untuk `action === "uploadFoto"` → panggil `uploadFotoToDrive`
- Tambah handler untuk `action === "saveFotoUrls"` → update kolom foto di Sheets row toko

### Fungsi: `saveFotoUrls(payload)`
```
Input:
{
  action: "saveFotoUrls",
  plantCode: "E281",
  fotoMap: {
    "Apple_LDU_Foto": "https://...",
    "Apple_Wallbay_Foto": "https://...",
    "Samsung_LDU_Foto": ""
  }
}
```
Update kolom yang relevan di row toko.

---

## submit.html — Step 3 Baru

Setelah Step 2 (checklist), tambah Step 3:

```html
<div class="submit-step" id="step-foto">
  <div class="step-header">
    <span class="step-num">3</span>
    Foto LDU & Wallbay
    <span class="badge-optional">Opsional</span>
  </div>
  <div class="step-body">
    <!-- Accordion per brand yang dipilih di step 2 -->
    <!-- Hanya tampilkan brand yang punya device terpilih -->
    <div class="foto-accordion" id="foto-accordion"></div>
    <div class="step-actions">
      <button onclick="skipFoto()">Lewati</button>
      <button onclick="submitWithFoto()">Submit →</button>
    </div>
  </div>
</div>
```

Accordion per brand:
- Header: brand name + badge jumlah foto
- Body: 2 zona upload (LDU biru, Wallbay hijau)
- Setiap zona: preview thumbnail + tombol ganti
- Hanya tampil brand yang punya ≥1 device terpilih di checklist

---

## assets/js/foto-upload.js — File Baru

Tanggung jawab:
- `buildFotoAccordion(selectedBrands)` — render accordion
- `onFotoSelect(brand, type, file)` — handle file input change, compress, preview
- `compressImage(file, maxKB)` — compress ke max 800KB sebelum upload
- `uploadFotoToAppsScript(brand, type, base64)` — POST ke API
- `collectFotoUrls()` → return map `{Brand_Type_Foto: url}`

---

## store-detail.html & store-detail.js

### Tab baru:
```html
<div class="tab-row">
  <button class="tab active" onclick="setTab('ldu')">📊 LDU Count</button>
  <button class="tab" onclick="setTab('foto')">📸 Foto</button>
</div>
<div id="tab-ldu"><!-- existing ldu grid --></div>
<div id="tab-foto" style="display:none"><!-- foto gallery --></div>
```

### Gallery foto:
- Per brand yang ada di data toko
- 2 kolom: LDU (biru) + Wallbay (hijau)
- Klik foto → buka di tab baru (URL Drive)
- Jika kosong → placeholder "Belum ada foto"
- Ambil data dari `row['{Brand}_LDU_Foto']` dan `row['{Brand}_Wallbay_Foto']`

---

## Files yang Berubah

| File | Aksi |
|---|---|
| `Code.gs` | Tambah `uploadFotoToDrive()`, `saveFotoUrls()`, update `doPost` |
| `submit.html` | Tambah Step 3 HTML (accordion foto) |
| `assets/js/foto-upload.js` | File baru — logika upload foto |
| `assets/js/submit.js` | Update flow: setelah checklist → step foto → submit |
| `store-detail.html` | Tambah tab row + tab-foto div |
| `assets/js/store-detail.js` | Tambah `renderFotoTab()`, tab switching |
| `assets/css/style.css` | Tambah styles foto accordion, gallery, tab |

---

## Constraints

- Foto dikompress client-side ke max 800KB sebelum dikirim
- Upload foto dilakukan satu per satu (bukan batch) untuk menghindari timeout Apps Script
- Foto bersifat opsional — jika tidak ada foto, submit tetap berjalan normal
- Apps Script timeout max 30 detik per request — tiap foto = 1 request terpisah
- Drive file permission: `anyone with link can view` (tidak public index)
