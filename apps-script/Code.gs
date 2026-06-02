// ============================================================
// ERA-PLANOGRAM — Google Apps Script
// File: Code.gs
// Paste seluruh isi file ini ke Apps Script editor di Google Sheet
// ============================================================

const SHEET_NAME = 'ERA-PLANOGRAM';

// ── TRIGGER: dipanggil otomatis saat Google Form disubmit ──
function onFormSubmit(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      Logger.log('ERROR: Sheet tidak ditemukan: ' + SHEET_NAME);
      return;
    }

    // e.namedValues = { "Plant Code": ["E544"], "Apple": ["2"], ... }
    const formData = e.namedValues;
    const plantCode = ((formData['Plant Code'] || [''])[0]).toString().trim().toUpperCase();

    if (!plantCode) {
      Logger.log('ERROR: Plant Code kosong di form response');
      return;
    }

    updateMasterSheet(sheet, formData, plantCode);
    Logger.log('SUCCESS: Updated plant code ' + plantCode);

  } catch (err) {
    Logger.log('ERROR onFormSubmit: ' + err.toString());
  }
}

// ── UPDATE BARIS DI SHEET BERDASARKAN PLANT CODE ──
function updateMasterSheet(sheet, formData, plantCode) {
  // 1. Build header map: lowercase(header) → column index (1-based)
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerMap = {};
  headers.forEach(function(h, i) {
    if (h) headerMap[h.toString().toLowerCase().trim()] = i + 1;
  });

  // 2. Cari baris yang Plant Code-nya cocok (kolom A)
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('ERROR: Sheet kosong');
    return;
  }

  const plantCodes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < plantCodes.length; i++) {
    if (plantCodes[i][0].toString().trim().toUpperCase() === plantCode) {
      targetRow = i + 2; // +1 skip header, +1 karena 0-indexed
      break;
    }
  }

  if (targetRow === -1) {
    Logger.log('ERROR: Plant Code tidak ditemukan di sheet: ' + plantCode);
    return;
  }

  // 3. Update setiap field brand dari form ke kolom yang sesuai
  const skipFields = ['plant code', 'store name', 'timestamp'];
  Object.keys(formData).forEach(function(fieldName) {
    if (skipFields.indexOf(fieldName.toLowerCase().trim()) !== -1) return;

    const colIdx = headerMap[fieldName.toLowerCase().trim()];
    if (colIdx) {
      const rawVal = (formData[fieldName][0] || '0').toString().trim();
      const numVal = parseInt(rawVal, 10);
      sheet.getRange(targetRow, colIdx).setValue(isNaN(numVal) ? 0 : numVal);
    } else {
      Logger.log('WARN: Field form tidak ada match header: ' + fieldName);
    }
  });

  // 4. Update Last Submit dan Status
  const lastSubmitCol = headerMap['last submit'];
  const statusCol = headerMap['status'];

  if (lastSubmitCol) {
    sheet.getRange(targetRow, lastSubmitCol).setValue(
      Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm')
    );
  }
  if (statusCol) {
    sheet.getRange(targetRow, statusCol).setValue('Submitted');
  }
}

// ── doPost — menerima submission dari Custom Web Form ──
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);

    // Parse JSON body dari form
    const body = JSON.parse(e.postData.contents);
    const plantCode = (body['Plant Code'] || '').toString().trim().toUpperCase();

    if (!plantCode) throw new Error('Plant Code kosong');

    // Konversi format: { Apple: 3, Samsung: 2 } → { Apple: ['3'], Samsung: ['2'] }
    const formData = {};
    Object.keys(body).forEach(function(k) {
      formData[k] = [body[k] !== undefined ? body[k].toString() : '0'];
    });

    updateMasterSheet(sheet, formData, plantCode);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Data berhasil disimpan untuk ' + plantCode
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── JSON API — dipanggil Web Dashboard ──
// URL params opsional: ?store=E544 | ?status=Submitted | ?status=Pending
// Submit form via GET: ?action=submit&store=E544&Apple=3&Samsung=2&...
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);

    const params = (e && e.parameter) ? e.parameter : {};

    // ── Handle form submission via GET ──
    if (params.action === 'submit') {
      const plantCode = (params.store || '').toString().trim().toUpperCase();
      if (!plantCode) throw new Error('Plant Code kosong');

      // Build formData dari URL params (skip action & store)
      const skipKeys = ['action', 'store'];
      const formData = {};
      Object.keys(params).forEach(function(k) {
        if (skipKeys.indexOf(k) === -1) {
          formData[k] = [params[k] !== undefined ? params[k].toString() : '0'];
        }
      });

      updateMasterSheet(sheet, formData, plantCode);

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Data berhasil disimpan untuk ' + plantCode
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const allData = sheet.getDataRange().getValues();
    const headers = allData[0].map(function(h) { return h.toString().trim(); });

    const filterStore  = (params.store  || '').toUpperCase().trim();
    const filterStatus = (params.status || '').toLowerCase().trim();

    const result = [];
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row[0]) continue; // skip baris kosong

      const obj = {};
      headers.forEach(function(h, idx) {
        obj[h] = row[idx];
      });

      // Apply filters
      if (filterStore  && obj['Plant Code'].toString().toUpperCase() !== filterStore)  continue;
      if (filterStatus && (obj['Status'] || '').toLowerCase() !== filterStatus) continue;

      result.push(obj);
    }

    const output = {
      status: 'success',
      count: result.length,
      lastUpdated: new Date().toISOString(),
      data: result
    };

    return ContentService
      .createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── TEST MANUAL: jalankan fungsi ini dari Apps Script editor untuk test doGet ──
function testDoGet() {
  const fakeE = { parameter: {} };
  const result = doGet(fakeE);
  Logger.log(result.getContent().substring(0, 500));
}

// ── TEST MANUAL: jalankan fungsi ini untuk test update 1 baris ──
function testUpdateOneRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const fakeFormData = {
    'Plant Code': ['E544'],
    'Store Name': ['ERAFONE CILEGON'],
    'Apple': ['3'],
    'Samsung': ['2'],
    'Oppo': ['1'],
    'Xiaomi': ['0'],
    'Huawei': ['0']
  };
  updateMasterSheet(sheet, fakeFormData, 'E544');
  Logger.log('Test selesai — cek baris E544 di sheet');
}
