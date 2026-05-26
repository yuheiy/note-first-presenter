#!/usr/bin/env node
// Generate a 16:9 sample PDF used by tests and the local smoke fixture.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 960;
const HEIGHT = 540;
const PAGES = 3;

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= PAGES; i++) {
  const page = pdf.addPage([WIDTH, HEIGHT]);
  const text = `Page ${i}`;
  const size = 96;
  const textWidth = font.widthOfTextAtSize(text, size);
  const textHeight = font.heightAtSize(size);
  page.drawText(text, {
    x: (WIDTH - textWidth) / 2,
    y: (HEIGHT - textHeight) / 2,
    size,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
}

const bytes = await pdf.save();
const outPath = path.join(__dirname, 'sample.pdf');
await fs.writeFile(outPath, bytes);
console.log(`Wrote ${outPath} (${bytes.byteLength} bytes, ${WIDTH}x${HEIGHT}, ${PAGES} pages)`);
