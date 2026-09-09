const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({ size: 'A4', margin: 0 });
const stream = fs.createWriteStream('/tmp/ascent_test.pdf');
doc.pipe(stream);

doc.registerFont('Body-Bold', 'assets/fonts/SegoeUI-Bold.ttf');
doc.font('Body-Bold').fontSize(8.4);

// Draw a no-descender string at a KNOWN top-of-box y (100), lineBreak:false,
// same convention as boldText()'s doc.text(str, x, y0, ...).
const testY0 = 100;
doc.fillColor('#000000');
doc.text('TEST123', 50, testY0, { lineBreak: false });

doc.end();
stream.on('finish', () => console.log('done, testY0=' + testY0));
