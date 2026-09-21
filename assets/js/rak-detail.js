// assets/js/rak-detail.js — detail Rak Aksesoris Samsung per toko: collage foto + Qty Display
// URL: rak-detail.html?code=S041&month=2026-09
// Requires: config.js, rak-common.js, SheetJS (Export)

var _d = { code: '', store: null, month: '', months: [], row: null, tab: 'foto', items: [], byKey: {} };

document.addEventListener('DOMContentLoaded', function() {
  var q = new URLSearchParams(location.search);
  _d.code  = (q.get('code') || '').toUpperCase();
  _d.month = q.get('month') || '';
  _d.tab   = q.get('tab') === 'qty' ? 'qty' : 'foto';
  rakLoadCfg().then(function() {
    _d.store = RAK.cfg.stores[_d.code];
    if (!_d.store) return showFail('Toko <b>' + rakEsc(_d.code || '-') + '</b> tidak terdaftar di Rak Aksesoris Samsung.');
    _d.items = rakItemsFor(_d.code);
    load();
  }).catch(function(err) { showFail('Gagal memuat data toko. ' + rakEsc(err.message)); });
});

function showFail(html) {
  document.getElementById('view').innerHTML = '<div class="state-cell">⚠️ ' + html + '<br><br><a class="btn btn-blue" href="rak-dashboard.html">← Kembali ke dashboard</a></div>';
}

function load() {
  document.getElementById('view').innerHTML = '<div class="state-cell"><span class="spinner"></span>Memuat data...</div>';
  rakApi({ store: _d.code, month: _d.month }).then(function(j) {
    _d.month  = j.month;
    _d.months = j.availableMonths && j.availableMonths.length ? j.availableMonths : [j.month];
    _d.row    = j.data || null;
    _d.byKey  = {};
    ((_d.row && _d.row.items) || []).forEach(function(it) { _d.byKey[it.key] = it; });
    history.replaceState(null, '', 'rak-detail.html?code=' + encodeURIComponent(_d.code) + '&month=' + encodeURIComponent(_d.month) + (_d.tab === 'qty' ? '&tab=qty' : ''));
    render();
  }).catch(function(err) { showFail(err.message === RAK_OLD_BACKEND_MSG ? rakEsc(err.message) : 'Gagal memuat data. ' + rakEsc(err.message)); });
}

function setTab(t) { _d.tab = t; history.replaceState(null, '', location.search.replace(/&tab=\w+/, '') + (t === 'qty' ? '&tab=qty' : '')); render(); }
function setMonth(m) { _d.month = m; load(); }

// qty & foto satu aksesoris dari data tersimpan
function stateOf(it) {
  var s = _d.byKey[it.key];
  return { has: !!(s && s.photoUrl), qty: s ? Number(s.qty) || 0 : 0, ok: s && s.ok ? s.ok : [], s: s || null };
}

function totals() {
  var target = 0, actual = 0, foto = 0, gaps = 0;
  _d.items.forEach(function(it) {
    var st = stateOf(it); target += it.target; actual += st.qty; if (st.has) foto++; if (st.qty < it.target) gaps++;
  });
  return { target: target, actual: actual, foto: foto, gaps: gaps, pct: rakPct(actual, target) };
}

function render() {
  var sub = !!_d.row, t = totals(), bulan = rakMonthLabel(_d.month);
  var statusBadge = sub ? '<span class="badge-ok">Submitted ' + bulan + '</span>' : '<span class="badge-warn">Belum Submit ' + bulan + '</span>';
  var warn = sub ? '' : '<div class="sd-warn">⏳ Toko ini belum submit Rak Aksesoris Samsung periode ' + bulan + '. Bingkai di bawah masih kosong (placeholder).' +
    (_d.months.length > 1 ? ' Coba pilih periode lain.' : '') + '</div>';

  document.getElementById('view').innerHTML =
    '<div class="sd-head"><h1>' + rakEsc(_d.store.name) + '</h1><div class="sd-meta">' +
      '<span>📍 Plant Code: <b>' + rakEsc(_d.code) + '</b></span><span>🏷️ Brand: <b>Samsung Store</b></span><span>🗺️ Region 5 · ' + rakEsc(_d.store.area || '-') + '</span>' +
      '<span>Status: ' + statusBadge + '</span><span>Last Submit: <b>' + (sub ? rakFmtDate(_d.row.lastUpdated) : '-') + '</b></span>' +
      '<span>Qty Display: <b style="color:' + (sub ? rakColor(t.pct) : 'var(--gray-400)') + '">' + (sub ? t.actual + ' / ' + t.target + ' model (' + t.pct + '%)' : '—') + '</b></span>' +
      (rakHasStrap(_d.code) ? '<span class="tag-sel" style="margin:0">ALOKASI STRAP WATCH</span>' : '') +
    '</div></div>' +

    '<div class="sd-bar no-print">' +
      '<button class="sd-tab' + (_d.tab === 'qty' ? ' active' : '') + '" onclick="setTab(\'qty\')">📊 Qty Display Acc</button>' +
      '<button class="sd-tab' + (_d.tab === 'foto' ? ' active' : '') + '" onclick="setTab(\'foto\')">📸 Foto Rak Acc Samsung</button>' +
      '<div class="sd-spacer"></div>' +
      (_d.months.length > 1 ? '<div class="period-row" style="padding:0"><span>Periode:</span>' + _d.months.map(function(m) {
        return '<button class="period-btn' + (m === _d.month ? ' active' : '') + '" onclick="setMonth(\'' + m + '\')">' + rakMonthLabel(m) + '</button>';
      }).join('') + '</div>' : '') +
    '</div>' + warn +
    (_d.tab === 'foto' ? fotoHtml(sub) : qtyHtml(sub, t));
}

function fotoHtml(sub) {
  var frames = RAK.cfg.items.map(function(it) {
    var label = rakEsc(it.name.toUpperCase());
    // Item khusus toko alokasi: di toko lain tetap ada bingkainya tapi kosong (seperti template)
    if (it.selected && !rakHasStrap(_d.code)) return '<div class="cg-frame na" title="Tidak dapat alokasi"><div class="cg-label">' + label + '</div><div class="cg-photo"></div></div>';
    var st = stateOf(it);
    var badge = sub ? '<span class="cg-qty" style="color:' + (st.qty >= it.target ? '#15803d' : st.qty ? '#b45309' : '#b91c1c') + '">' + st.qty + '/' + it.target + '</span>' : '';
    var body;
    if (st.has) {
      var m = st.s.meta, tip = m ? 'Diambil ' + (m.takenAt ? rakFmtDate(m.takenAt) : '-') + (m.device ? ' · ' + m.device : '') + (m.address ? ' · ' + m.address : '') : '';
      body = '<div class="cg-photo" title="' + rakEsc(tip) + '"><a href="' + rakEsc(st.s.photoUrl) + '" target="_blank" rel="noopener">' +
        '<img src="' + rakThumb(rakFileId(st.s), 500) + '" alt="' + label + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.innerHTML=\'📷\'"></a>' + badge + '</div>';
    } else {
      body = '<div class="cg-photo empty">' + badge + '</div>';
    }
    return '<div class="cg-frame"><div class="cg-label">' + label + '</div>' + body + '</div>';
  }).join('');

  return '<div class="sd-bar no-print" style="margin-bottom:8px"><div class="sd-title">Foto Rak Aksesoris Samsung</div><div class="sd-spacer"></div>' +
      '<label class="sd-check"><input type="checkbox" checked onchange="document.getElementById(\'collage\').classList.toggle(\'hide-qty\',!this.checked)"> Tampilkan qty di frame</label>' +
      '<button class="btn-shot" id="btn-shot" onclick="screenshotCollage()">📸 Screenshot</button>' +
      '<button class="btn-pdf" id="btn-pdf" onclick="exportCollagePdf()">📥 Export PDF</button></div>' +
    '<div class="collage" id="collage">' +
      '<div class="cg-title">(' + rakEsc(_d.code) + ') ' + rakEsc(_d.store.name) + '</div>' +
      '<div class="cg-grid">' + frames + '</div>' +
      '<div class="cg-note"><ul>' +
        '<li>Upload foto dengan mode potrait / vertical dengan ukuran 3:4 agar pas di frame</li>' +
        '<li>Jangan mengupload foto screenshoot, karena ukuran akan tidak pas di frame</li>' +
        '<li>Jika ada salah satu item yg kosong tidak perlu upload pada item tersebut</li>' +
        '<li>Jangan meresize atau merubah posisi apapun di dalam design templete</li></ul></div>' +
    '</div>';
}

function qtyHtml(sub, t) {
  var rows = RAK.cfg.items.map(function(it, k) {
    if (it.selected && !rakHasStrap(_d.code)) {
      return '<tr class="na-row"><td class="col-num">' + (k + 1) + '</td><td class="col-store">' + rakEsc(it.name) + '<span class="tag-sel">STRAP</span></td>' +
        '<td colspan="5">Tidak dapat alokasi (thematic table only)</td></tr>';
    }
    var st = stateOf(it);
    var chips = it.types.length > 1
      ? it.types.map(function(tp, j) {
          var cls = !sub ? 'x' : (st.has && st.ok[j]) ? 'y' : 'n';
          return '<span class="type-chip ' + cls + '">' + (cls === 'y' ? '✓ ' : cls === 'n' ? '✕ ' : '') + rakEsc(tp) + '</span>';
        }).join('')
      : '<span class="muted" style="font-size:12px">1 model</span>';
    var status = !sub ? '<span class="muted">—</span>' : st.qty >= it.target ? '<span class="badge-ok">Lengkap</span>' : st.qty ? '<span class="badge-warn">Kurang</span>' : '<span class="badge-bad">Kosong</span>';
    var foto = st.has ? '<a href="' + rakEsc(st.s.photoUrl) + '" target="_blank" rel="noopener" title="Buka foto">📷</a>' : '<span class="muted">—</span>';
    return '<tr><td class="col-num">' + (k + 1) + '</td><td class="col-store">' + rakEsc(it.name) + (it.selected ? '<span class="tag-sel">STRAP</span>' : '') + '</td><td>' + chips + '</td>' +
      '<td class="col-num">' + it.target + '</td>' +
      '<td class="col-num" style="color:' + (!sub ? 'var(--gray-400)' : st.qty >= it.target ? '#15803d' : '#b45309') + '">' + (sub ? st.qty : '—') + '</td>' +
      '<td style="text-align:center">' + status + '</td><td style="text-align:center">' + foto + '</td></tr>';
  }).join('');

  return '<div class="sd-title" style="margin-bottom:12px">Update Qty Display Acc</div><div class="table-wrap"><table class="data-table">' +
    '<thead><tr><th style="text-align:center">No</th><th>Aksesoris</th><th>Type Model</th><th style="text-align:center">Target Display</th><th style="text-align:center">Aktual</th><th style="text-align:center">Status</th><th style="text-align:center">Foto</th></tr></thead>' +
    '<tbody>' + rows + '<tr class="qty-total"><td></td><td>TOTAL</td><td></td><td class="col-num">' + t.target + '</td><td class="col-num">' + (sub ? t.actual : '—') +
    '</td><td style="text-align:center">' + (sub ? t.pct + '%' : '—') + '</td><td style="text-align:center">' + (sub ? t.foto + '/' + _d.items.length : '—') + '</td></tr></tbody></table></div>';
}

// Export Excel: tabel Qty Display toko ini untuk periode terpilih
function exportStoreRak() {
  if (!_d.store) return;
  var rows = _d.items.map(function(it, k) {
    var st = stateOf(it), m = st.s && st.s.meta;
    return {
      'No': k + 1, 'Aksesoris': it.name, 'Type Model': it.types.join(', '), 'Target Display': it.target,
      'Aktual': _d.row ? st.qty : '', 'Status': !_d.row ? '' : st.qty >= it.target ? 'Lengkap' : st.qty ? 'Kurang' : 'Kosong',
      'Type Ter-display': it.types.length > 1 && st.has ? it.types.filter(function(_, j) { return st.ok[j]; }).join(', ') : '',
      'Link Foto': st.has ? st.s.photoUrl : '', 'Foto Diambil': m && m.takenAt ? rakFmtDate(m.takenAt) : '', 'Lokasi Foto': m && m.address ? m.address : ''
    };
  });
  var wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 26 }, { wch: 46 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Qty Display Acc');
  var now = new Date(), ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  XLSX.writeFile(wb, 'ERA-PLANOGRAM-RAK-SAMSUNG-' + _d.code + '-' + rakMonthLabel(_d.month).toUpperCase().replace(/\s+/g, '-') + '_' + ymd + '.xlsx');
}

// ══════════════════════════════════════════════════════════════
// Screenshot (PNG 16:9) & Export PDF — collage digambar langsung ke <canvas> 1920×1080
// Foto diambil dari lh3.googleusercontent.com (mengirim CORS "*"), jadi kanvas tidak "tainted"
// dan bisa diekspor tanpa perubahan di Apps Script.
// ══════════════════════════════════════════════════════════════
var CG_W = 1920, CG_H = 1080, CG_BLUE = '#0a4fb0';
var CG_NOTES = [
  'Upload foto dengan mode potrait / vertical dengan ukuran 3:4 agar pas di frame',
  'Jangan mengupload foto screenshoot, karena ukuran akan tidak pas di frame',
  'Jika ada salah satu item yg kosong tidak perlu upload pada item tersebut',
  'Jangan meresize atau merubah posisi apapun di dalam design templete'
];

function cgPath(ctx, x, y, w, h, r) {           // r = angka, atau [kiriAtas, kananAtas, kananBawah, kiriBawah]
  var c = typeof r === 'number' ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + c[0], y); ctx.lineTo(x + w - c[1], y); ctx.quadraticCurveTo(x + w, y, x + w, y + c[1]);
  ctx.lineTo(x + w, y + h - c[2]); ctx.quadraticCurveTo(x + w, y + h, x + w - c[2], y + h);
  ctx.lineTo(x + c[3], y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - c[3]);
  ctx.lineTo(x, y + c[0]); ctx.quadraticCurveTo(x, y, x + c[0], y); ctx.closePath();
}
function cgLoadImg(url, tries) {
  tries = tries == null ? 1 : tries;               // ulang sekali kalau gagal (mis. dibatasi sementara oleh Google)
  return new Promise(function(resolve) {
    var im = new Image(), t = setTimeout(function() { resolve(null); }, 25000);
    im.crossOrigin = 'anonymous';
    im.referrerPolicy = 'no-referrer';              // tanpa Referer: tidak terkena blokir berbasis referer
    im.onload  = function() { clearTimeout(t); resolve(im); };
    im.onerror = function() {
      clearTimeout(t);
      if (tries > 0) setTimeout(function() { cgLoadImg(url, tries - 1).then(resolve); }, 1500); else resolve(null);
    };
    im.src = url;
  });
}
function cgWrap(ctx, text, maxW) {
  var words = text.split(' '), lines = [], cur = '';
  words.forEach(function(w) {
    var test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  });
  if (cur) lines.push(cur);
  return lines;
}
function cgCover(ctx, im, x, y, w, h) {          // isi kotak penuh, potong tengah (object-fit: cover)
  var s = Math.max(w / im.width, h / im.height), sw = w / s, sh = h / s;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}
function cgEmptyPhoto(ctx, x, y, w, h) {         // placeholder awan + bukit seperti template
  var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#9fd4ff'); g.addColorStop(1, '#f1f9ff');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  var sx = w / 120, sy = h / 160;
  ctx.fillStyle = '#fff';
  [[40, 50, 20, 11], [60, 42, 14, 12], [78, 52, 16, 10]].forEach(function(e) {
    ctx.beginPath(); ctx.ellipse(x + e[0] * sx, y + e[1] * sy, e[2] * sx, e[3] * sy, 0, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#8ea60a'; ctx.beginPath(); ctx.moveTo(x, y + 126 * sy); ctx.quadraticCurveTo(x + 40 * sx, y + 96 * sy, x + w, y + 130 * sy); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
  ctx.fillStyle = '#a7bd1c'; ctx.beginPath(); ctx.moveTo(x, y + 140 * sy); ctx.quadraticCurveTo(x + 60 * sx, y + 116 * sy, x + w, y + 142 * sy); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
}

// Menggambar collage ke kanvas 1920×1080 (16:9). showQty = ikut tanda "qty/target" di tiap frame.
async function buildCollageCanvas(showQty) {
  if (document.fonts && document.fonts.load) { try { await document.fonts.load('800 38px Inter'); await document.fonts.load('700 13px Inter'); } catch (e) {} }
  var FONT = 'Inter, -apple-system, "Segoe UI", Arial, sans-serif';
  var items = RAK.cfg.items.map(function(it) {
    var na = it.selected && !rakHasStrap(_d.code), st = na ? null : stateOf(it);
    return { it: it, na: na, st: st, img: null };
  });
  // muat semua foto, maksimal 6 permintaan sekaligus
  var queue = items.filter(function(f) { return !f.na && f.st.has && rakFileId(f.st.s); }), qi = 0;
  async function worker() {
    while (qi < queue.length) {
      var f = queue[qi++];
      f.img = await cgLoadImg('https://lh3.googleusercontent.com/d/' + encodeURIComponent(rakFileId(f.st.s)) + '=w600');
    }
  }
  await Promise.all([0, 1, 2, 3, 4, 5].map(worker));

  var canvas = document.createElement('canvas'); canvas.width = CG_W; canvas.height = CG_H;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, CG_W, CG_H);

  // judul
  var PAD = 24, titleH = 68, title = '(' + _d.code + ') ' + _d.store.name;
  ctx.font = '800 38px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var tw = Math.min(CG_W - 100, ctx.measureText(title).width + 96);
  cgPath(ctx, (CG_W - tw) / 2, PAD, tw, titleH, 14); ctx.fillStyle = CG_BLUE; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(title, CG_W / 2, PAD + titleH / 2 + 1, tw - 40);

  // kotak panduan (bawah)
  var noteH = 112, noteW = 1560, noteX = (CG_W - noteW) / 2, noteY = CG_H - PAD - noteH;
  cgPath(ctx, noteX, noteY, noteW, noteH, 30); ctx.fillStyle = CG_BLUE; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '600 16px ' + FONT; ctx.textAlign = 'left';
  CG_NOTES.forEach(function(t, i) { var y = noteY + 24 + i * 21; ctx.fillText('•', noteX + 36, y); ctx.fillText(t, noteX + 54, y); });

  // grid frame: 9 kolom, baris terakhir di tengah
  var COLS = 9, GAP = 12, HEAD = 36, BORD = 4;
  var gridTop = PAD + titleH + 18, gridBot = noteY - 18, rows = Math.ceil(items.length / COLS);
  var fh = (gridBot - gridTop - (rows - 1) * GAP) / rows;
  var pw = (fh - HEAD - BORD) * 3 / 4, fw = pw + BORD * 2, ph = fh - HEAD - BORD;
  var failed = 0;
  items.forEach(function(f, i) {
    var row = Math.floor(i / COLS), inRow = Math.min(COLS, items.length - row * COLS), col = i % COLS;
    var rowW = inRow * fw + (inRow - 1) * GAP, x = (CG_W - rowW) / 2 + col * (fw + GAP), y = gridTop + row * (fh + GAP);
    cgPath(ctx, x, y, fw, fh, 13); ctx.fillStyle = CG_BLUE; ctx.fill();

    // label (maks 2 baris)
    var label = f.it.name.toUpperCase(), size = 13;
    ctx.font = '700 ' + size + 'px ' + FONT; var lines = cgWrap(ctx, label, fw - 12);
    if (lines.length > 2) { size = 11; ctx.font = '700 ' + size + 'px ' + FONT; lines = cgWrap(ctx, label, fw - 12); }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach(function(t, k) { ctx.fillText(t, x + fw / 2, y + HEAD / 2 + (k - (lines.length - 1) / 2) * (size + 2)); });
    if (f.na) return;                                            // item tidak berlaku: hanya header biru

    var px = x + BORD, py = y + HEAD;
    ctx.save(); cgPath(ctx, px, py, pw, ph, [0, 0, 9, 9]); ctx.clip();
    if (f.img) cgCover(ctx, f.img, px, py, pw, ph);
    else if (f.st.has) { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(px, py, pw, ph); ctx.fillStyle = '#64748b'; ctx.font = '600 12px ' + FONT; ctx.fillText('Foto gagal dimuat', px + pw / 2, py + ph / 2); failed++; }
    else cgEmptyPhoto(ctx, px, py, pw, ph);
    ctx.restore();

    if (showQty && _d.row) {                                     // badge qty/target di pojok kanan bawah foto
      var q = f.st.qty, tg = f.it.target, txt = q + '/' + tg;
      ctx.font = '800 12px ' + FONT; var bw = ctx.measureText(txt).width + 16, bh = 20, bx = px + pw - bw - 6, by = py + ph - bh - 6;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      cgPath(ctx, bx, by, bw, bh, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      ctx.fillStyle = q >= tg ? '#15803d' : q ? '#b45309' : '#b91c1c'; ctx.textAlign = 'center'; ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 1);
    }
  });
  return { canvas: canvas, failed: failed };
}

function cgFileName(ext) {
  var now = new Date(), ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  return 'ERA-PLANOGRAM-RAK-SAMSUNG-' + _d.code + '-' + rakMonthLabel(_d.month).toUpperCase().replace(/\s+/g, '-') + '_' + ymd + '.' + ext;
}
function cgBusy(on, txt) {
  ['btn-shot', 'btn-pdf'].forEach(function(id) { var b = document.getElementById(id); if (b) b.disabled = on; });
  var s = document.getElementById('btn-shot'); if (s && !on) s.innerHTML = '📸 Screenshot';
  var p = document.getElementById('btn-pdf');  if (p && !on) p.innerHTML = '📥 Export PDF';
  if (on && txt) { var t = document.getElementById(txt === 'pdf' ? 'btn-pdf' : 'btn-shot'); if (t) t.innerHTML = '⏳ Memproses...'; }
}
function cgShowQty() { var c = document.getElementById('collage'); return !(c && c.classList.contains('hide-qty')); }
function cgDownload(href, name) { var a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

// 📸 Screenshot → file .png, rasio 16:9 (1920×1080)
async function screenshotCollage() {
  cgBusy(true, 'shot');
  try {
    var r = await buildCollageCanvas(cgShowQty());
    var blob = await new Promise(function(res) { r.canvas.toBlob(res, 'image/png'); });
    if (!blob) throw new Error('Gagal membuat gambar');
    var url = URL.createObjectURL(blob); cgDownload(url, cgFileName('png')); setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
    rakToast(r.failed ? '⚠️ Screenshot tersimpan, tetapi ' + r.failed + ' foto gagal dimuat' : '✅ Screenshot tersimpan (PNG 1920×1080)');
  } catch (err) { rakToast('❌ Screenshot gagal: ' + err.message); console.error(err); }
  cgBusy(false);
}

// 📥 Export PDF → 1 halaman landscape 16:9 berisi collage yang sama
async function exportCollagePdf() {
  if (!window.jspdf) { rakToast('❌ Pustaka PDF belum termuat. Muat ulang halaman lalu coba lagi.'); return; }
  cgBusy(true, 'pdf');
  try {
    var r = await buildCollageCanvas(cgShowQty());
    var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [CG_W, CG_H], compress: true });
    doc.addImage(r.canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, CG_W, CG_H);
    doc.save(cgFileName('pdf'));
    rakToast(r.failed ? '⚠️ PDF tersimpan, tetapi ' + r.failed + ' foto gagal dimuat' : '✅ PDF tersimpan');
  } catch (err) { rakToast('❌ Export PDF gagal: ' + err.message); console.error(err); }
  cgBusy(false);
}
