/* Minimal .xlsx writer (no outside library): one data sheet plus a "Report info" sheet.
 * Text stays text (codes, coordinates), numbers are numbers, times are real Excel date-times in
 * Pakistan time. Files are a ZIP of XML parts (stored, not compressed).
 */
(function () {
  'use strict';
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { var c = 0xffffffff; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  var enc = new TextEncoder();

  function zip(files) {               // files: [{name, data: Uint8Array}]
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var size = central.reduce(function (s, p) { return s + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  /** Pakistan wall-clock time as an Excel serial number. */
  function excelTime(iso) { var ms = Date.parse(iso); return isNaN(ms) ? null : (ms + 5 * 3600000) / 86400000 + 25569; }

  function cell(ref, value, type, header) {
    if (value === null || value === undefined || value === '') return '';
    if (header) return '<c r="' + ref + '" t="inlineStr" s="1"><is><t>' + esc(value) + '</t></is></c>';
    if ((type === 'int' || type === 'num') && isFinite(Number(value))) return '<c r="' + ref + '"><v>' + Number(value) + '</v></c>';
    if (type === 'datetime') { var t = excelTime(value); if (t !== null) return '<c r="' + ref + '" s="2"><v>' + t + '</v></c>'; }
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>';
  }
  function sheetXml(columns, rows, widths) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'];
    columns.forEach(function (c, i) { out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (widths ? widths[i] : Math.min(40, Math.max(10, String(c.label).length + 4))) + '" customWidth="1"/>'); });
    out.push('</cols><sheetData><row r="1">');
    columns.forEach(function (c, i) { out.push(cell(colName(i) + '1', c.label, 'text', true)); });
    out.push('</row>');
    rows.forEach(function (r, ri) {
      out.push('<row r="' + (ri + 2) + '">');
      columns.forEach(function (c, i) { out.push(cell(colName(i) + (ri + 2), r[c.key], c.type, false)); });
      out.push('</row>');
    });
    out.push('</sheetData>');
    if (rows.length) out.push('<autoFilter ref="A1:' + colName(columns.length - 1) + (rows.length + 1) + '"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  /** build({title, columns, rows, info: [[label, value]...]}) -> Blob */
  function build(rep) {
    var cols = rep.columns, widths = cols.map(function (c) {
      var m = String(c.label).length;
      rep.rows.slice(0, 300).forEach(function (r) { var v = r[c.key]; if (v !== null && v !== undefined) m = Math.max(m, c.type === 'datetime' ? 16 : String(v).length); });
      return Math.min(50, m + 2);
    });
    var info = sheetXml([{ key: 'a', label: rep.title }, { key: 'b', label: '' }], rep.info.map(function (x) { return { a: x[0], b: x[1] }; }), [48, 60]);
    var f = function (name, s) { return { name: name, data: enc.encode(s) }; };
    return zip([
      f('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
      f('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      f('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/><sheet name="Report info" sheetId="2" r:id="rId2"/></sheets>' +
        (rep.rows.length ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Report!$A$1:$' + colName(cols.length - 1) + '$' + (rep.rows.length + 1) + '</definedName></definedNames>' : '') + '</workbook>'),
      f('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
      f('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>'),
      f('xl/worksheets/sheet1.xml', sheetXml(cols, rep.rows, widths)),
      f('xl/worksheets/sheet2.xml', info)
    ]);
  }
  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }
  window.EBM_XLSX = { build: build, download: download };
})();
