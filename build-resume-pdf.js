/* Build-only PDF generator. The resume text is read from resumeData in script.js. */
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('script.js', 'utf8');
const match = source.match(/const resumeData=(.*);\nconst escapeHTML/);
if (!match) throw new Error('Could not find resumeData in script.js');
const resume = vm.runInNewContext(`(${match[1]})`);
const drawing = [];
const winAnsi = {'—':0x97,'–':0x96,'’':0x92,'‘':0x91,'“':0x93,'”':0x94,'•':0x95,'…':0x85};
let y = 790;

function pdfText(value) {
  const text = [...String(value)].map(char => {
    const code = winAnsi[char] ?? char.codePointAt(0);
    const byte = code <= 255 ? code : 63;
    if (byte === 40 || byte === 41 || byte === 92) return `\\${String.fromCharCode(byte)}`;
    if (byte < 32 || byte > 126) return `\\${byte.toString(8).padStart(3, '0')}`;
    return String.fromCharCode(byte);
  }).join('');
  return `(${text})`;
}

function line(value, size = 9, font = 'F1', color = '0.10 0.09 0.16', indent = 0) {
  drawing.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${54 + indent} ${y.toFixed(2)} Tm ${pdfText(value)} Tj ET`);
  y -= size * 1.42;
}

function wrapped(value, size = 8.5, indent = 0) {
  const maxChars = 112 - indent;
  let current = '';
  const lines = [];
  for (const word of String(value).split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  for (const valueLine of lines) line(valueLine, size, 'F1', '0.10 0.09 0.16', indent);
}

function section(title) {
  line(title.toUpperCase(), 10, 'F2', '0.05 0.02 0.33');
  drawing.push(`0.8 w 0.85 0.31 0.75 RG 54 ${y.toFixed(2)} m 541 ${y.toFixed(2)} l S`);
  y -= 10;
}

line(resume.name.toUpperCase(), 24, 'F2', '0.05 0.02 0.33');
line(resume.title, 11, 'F2', '0.47 0.07 0.37');
line(`${resume.location}  |  ${resume.contact.email}  |  ${resume.contact.phone}  |  ${resume.contact.portfolio}`, 8.3, 'F1', '0.23 0.21 0.38');
y -= 4;
section('Professional Summary');
wrapped(resume.summary, 8.4);
y -= 2;
section('Skills');
for (const skill of resume.skills) wrapped(`${skill.label}: ${skill.items}`, 8.4);
y -= 2;
section('Selected Projects');
for (const project of resume.projects) {
  line(project.title, 9, 'F2', '0.05 0.02 0.33');
  wrapped(project.description, 8.25);
  line(`Tools: ${project.tools}`, 8, 'F3', '0.23 0.21 0.38');
  y -= 2;
}
section('Experience');
for (const role of resume.experience) {
  line(`${role.role} — ${role.company}`, 9, 'F2', '0.05 0.02 0.33');
  line(resume.contact.dates, 7.8, 'F3', '0.47 0.07 0.37');
  for (const detail of role.items) wrapped(`• ${detail}`, 8.15, 10);
  y -= 1;
}
section('Referees');
wrapped(resume.referees, 8.4);
if (y < 35) throw new Error(`Resume content does not fit on one A4 page (baseline ${y.toFixed(1)} pt)`);

const content = Buffer.from(drawing.join('\n'), 'latin1');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
  Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'ascii'), content, Buffer.from('\nendstream', 'ascii')]),
  '<< /Title (Jolomi Omadeli Resume) /Author (Jolomi Omadeli) >>'
];

let pdf = '%PDF-1.4\n%âãÏÓ\n';
const offsets = [0];
for (let index = 0; index < objects.length; index++) {
  offsets.push(Buffer.byteLength(pdf, 'latin1'));
  const object = objects[index];
  pdf += `${index + 1} 0 obj\n${Buffer.isBuffer(object) ? object.toString('latin1') : object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

fs.mkdirSync('assets/resume', {recursive:true});
fs.writeFileSync('assets/resume/Jolomi-Omadeli-Resume.pdf', Buffer.from(pdf, 'latin1'));
console.log(`Wrote one-page, selectable-text A4 PDF (${y.toFixed(1)} pt final baseline).`);
