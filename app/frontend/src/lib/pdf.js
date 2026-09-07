// src/lib/pdf.js
// Generación de reportes en PDF en el navegador (sin backend), usados por
// los botones "Descargar PDF" de historial de ventas, caja, resultados del
// mes y pedidos a proveedores.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY = [28, 32, 80];

function formatNow() {
  return new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// meta: líneas de texto simples debajo del encabezado (ej: período, filtros)
// columns/rows: tabla principal (opcional, puede omitirse para reportes sin tabla)
// summary: pares [etiqueta, valor] destacados al final
// sections: tablas adicionales, cada una { title, columns, rows }
export function downloadPdfReport({ title, subtitle, kioskName, meta = [], columns, rows, summary = [], sections = [], filename }) {
  const doc = new jsPDF({ unit: 'pt' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, marginX, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (subtitle) doc.text(subtitle, marginX, 48);
  doc.setFontSize(9);
  if (kioskName) doc.text(`Sucursal: ${kioskName}`, marginX, 63);
  doc.text(`Generado: ${formatNow()}`, pageWidth - marginX, 63, { align: 'right' });

  let cursorY = 94;

  if (meta.length) {
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    meta.forEach((line) => {
      doc.text(line, marginX, cursorY);
      cursorY += 14;
    });
    cursorY += 6;
  }

  if (columns && rows) {
    autoTable(doc, {
      startY: cursorY,
      head: [columns],
      body: rows,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 8, cellPadding: 5, textColor: [40, 40, 40] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    cursorY = doc.lastAutoTable.finalY + 22;
  }

  sections.forEach((section) => {
    if (cursorY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      cursorY = 40;
    }
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(section.title, marginX, cursorY);
    cursorY += 10;
    autoTable(doc, {
      startY: cursorY,
      head: [section.columns],
      body: section.rows,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 8, cellPadding: 5, textColor: [40, 40, 40] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    cursorY = doc.lastAutoTable.finalY + 22;
  });

  if (summary.length) {
    if (cursorY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      cursorY = 40;
    }
    doc.setFontSize(10);
    summary.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 90, 90);
      doc.text(label, marginX, cursorY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text(String(value), pageWidth - marginX, cursorY, { align: 'right' });
      cursorY += 16;
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Grupo Vexus · Kiosco App', marginX, pageHeight - 20);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, pageHeight - 20, { align: 'right' });
  }

  doc.save(filename);
}
