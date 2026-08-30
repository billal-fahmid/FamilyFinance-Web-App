'use client';

// Lightweight client-side exporters. Columns/rows are plain arrays so any
// dataset (transactions, statements, a report summary) can be exported.

export type ExportRow = Record<string, string | number | null | undefined>;

function toMatrix(columns: string[], rows: ExportRow[]): (string | number)[][] {
  const header = columns;
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c];
    return v === null || v === undefined ? '' : v;
  }));
  return [header, ...body];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(filename: string, columns: string[], rows: ExportRow[]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = toMatrix(columns, rows).map((line) => line.map(esc).join(',')).join('\r\n');
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

export async function exportXLSX(
  filename: string,
  sheets: { name: string; columns: string[]; rows: ExportRow[] }[]
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(s.columns, s.rows));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportPDF(
  filename: string,
  title: string,
  sections: { heading?: string; columns: string[]; rows: ExportRow[] }[],
  subtitle?: string
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });

  doc.setFontSize(16);
  doc.text(title, 40, 40);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(subtitle, 40, 58);
    doc.setTextColor(0);
  }

  let startY = subtitle ? 76 : 60;
  for (const section of sections) {
    if (section.heading) {
      doc.setFontSize(12);
      doc.text(section.heading, 40, startY);
      startY += 8;
    }
    autoTable(doc, {
      startY,
      head: [section.columns],
      body: section.rows.map((r) => section.columns.map((c) => {
        const v = r[c];
        return v === null || v === undefined ? '' : String(v);
      })),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 128, 90] },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error autotable augments doc at runtime
    startY = (doc.lastAutoTable?.finalY ?? startY) + 28;
  }

  doc.save(`${filename}.pdf`);
}
