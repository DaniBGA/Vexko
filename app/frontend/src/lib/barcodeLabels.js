// src/lib/barcodeLabels.js
// Genera el PDF de etiquetas con código de barra (plan premium, sección Stock).
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

const PAGE_MARGIN = 8; // mm
const COLS = 3;
const ROWS = 7;
const GUTTER = 3; // mm entre etiquetas

function renderBarcodeDataUrl(value) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 16,
    height: 45,
    margin: 4,
  });
  return canvas.toDataURL('image/png');
}

// labels: [{ name, barcode, priceLabel }]
export function downloadBarcodeLabelsPdf(labels, { filename = 'etiquetas.pdf' } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PAGE_MARGIN * 2;
  const usableHeight = pageHeight - PAGE_MARGIN * 2;
  const cellWidth = (usableWidth - GUTTER * (COLS - 1)) / COLS;
  const cellHeight = (usableHeight - GUTTER * (ROWS - 1)) / ROWS;
  const perPage = COLS * ROWS;

  labels.forEach((label, index) => {
    const posInPage = index % perPage;
    if (posInPage === 0 && index > 0) doc.addPage();

    const col = posInPage % COLS;
    const row = Math.floor(posInPage / COLS);
    const x = PAGE_MARGIN + col * (cellWidth + GUTTER);
    const y = PAGE_MARGIN + row * (cellHeight + GUTTER);

    doc.setDrawColor(205, 205, 205);
    doc.roundedRect(x, y, cellWidth, cellHeight, 1.2, 1.2);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    const nameLines = doc.splitTextToSize(label.name || '', cellWidth - 4);
    doc.text(nameLines.slice(0, 2), x + cellWidth / 2, y + 4.5, { align: 'center' });

    const imgData = renderBarcodeDataUrl(label.barcode);
    const barcodeWidth = cellWidth - 6;
    const barcodeHeight = cellHeight * 0.5;
    doc.addImage(imgData, 'PNG', x + 3, y + cellHeight * 0.3, barcodeWidth, barcodeHeight);

    if (label.priceLabel) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 15, 15);
      doc.text(label.priceLabel, x + cellWidth / 2, y + cellHeight - 2.5, { align: 'center' });
    }
  });

  doc.save(filename);
}
