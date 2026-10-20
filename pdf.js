// Generatore PDF minimale: una foto JPEG per pagina, senza librerie esterne.
// Tutto avviene sul telefono: nessun file esce dal dispositivo.
const enc = new TextEncoder();
const A4 = [595.28, 841.89];
const MARGIN = 14;

const n = (v) => Number(v.toFixed(2)).toString();

/** @param {{jpeg: Uint8Array, w: number, h: number}[]} pages */
export function buildPdf(pages) {
  if (!pages.length) throw new Error('Nessuna pagina da salvare');

  const parts = [];
  let size = 0;
  const offsets = [];
  const add = (x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    size += b.length;
  };
  const begin = (id) => {
    offsets[id] = size;
    add(`${id} 0 obj\n`);
  };
  const end = () => add('\nendobj\n');

  add('%PDF-1.4\n');
  add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // commento binario

  const total = 2 + pages.length * 3;
  begin(1);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  end();

  begin(2);
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  end();

  pages.forEach((p, i) => {
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const [pw, ph] = p.w > p.h ? [A4[1], A4[0]] : A4;
    const k = Math.min((pw - 2 * MARGIN) / p.w, (ph - 2 * MARGIN) / p.h);
    const dw = p.w * k;
    const dh = p.h * k;
    const px = (pw - dw) / 2;
    const py = (ph - dh) / 2;

    begin(pageId);
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pw)} ${n(ph)}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    end();

    const content = `q ${n(dw)} 0 0 ${n(dh)} ${n(px)} ${n(py)} cm /Im0 Do Q`;
    begin(contentId);
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    end();

    begin(imageId);
    add(
      `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`
    );
    add(p.jpeg);
    add('\nendstream');
    end();
  });

  const xrefPos = size;
  let xr = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) xr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xr += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  add(xr);

  const out = new Uint8Array(size);
  let o = 0;
  for (const b of parts) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}
