import { TZ, dateBR, itemsOf, lineQty, lineTotal, formatPhone } from "./shared";

// PDF feito à mão, sem biblioteca: Helvetica (WinAnsi), várias páginas e logo JPEG opcional.

const WIN = {
  á: "\\341", à: "\\340", ã: "\\343", â: "\\342", ä: "\\344",
  é: "\\351", è: "\\350", ê: "\\352", í: "\\355", ï: "\\357",
  ó: "\\363", ò: "\\362", õ: "\\365", ô: "\\364", ö: "\\366",
  ú: "\\372", ü: "\\374", ç: "\\347", ñ: "\\361",
  Á: "\\301", À: "\\300", Ã: "\\303", Â: "\\302",
  É: "\\311", Ê: "\\312", Í: "\\315",
  Ó: "\\323", Õ: "\\325", Ô: "\\324",
  Ú: "\\332", Ü: "\\334", Ç: "\\307", Ñ: "\\321",
  "\u00a0": " ", "\u202f": " ", º: "\\272", ª: "\\252", "°": "\\260", "×": "x",
  "–": "-", "—": "-", "‘": "'", "’": "'", "“": "\\042", "”": "\\042", "•": "-", "…": "..."
};

function pdfText(value) {
  return String(value ?? "")
    .replace(/[\\()]/g, (c) => "\\" + c)
    .replace(/[^\x20-\x7E]/g, (ch) => WIN[ch] || "");
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function quoteNumber(quote) {
  const raw = String(quote.token || "demo").replace(/^d\./, "").slice(0, 6).toUpperCase();
  return "ORC-" + raw;
}

function jobTitle(quote) {
  const service = String(quote.service_name || "").trim();
  const client = String(quote.client_name || "").trim();
  const detail = String(quote.description || "").trim();
  if (service && service.toLowerCase() !== client.toLowerCase()) return service;
  return detail || service || "Servico";
}

function wrap(value, max) {
  const out = [];
  String(value || "").split(/\n/).forEach((para) => {
    let line = "";
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      while (word.length > max) {
        if (line) { out.push(line); line = ""; }
        out.push(word.slice(0, max));
        word = word.slice(max);
      }
      const next = line ? line + " " + word : word;
      if (next.length > max) { out.push(line); line = word; } else line = next;
    });
    if (line) out.push(line);
  });
  return out;
}

// Logo: só JPEG (o painel já reduz a logo para JPEG). Lê largura/altura do cabeçalho.
function jpegInfo(dataUrl) {
  if (!dataUrl || !/^data:image\/jpe?g;base64,/.test(dataUrl)) return null;
  try {
    const bin = atob(dataUrl.split(",")[1]);
    let i = 2;
    while (i < bin.length) {
      if (bin.charCodeAt(i) !== 0xff) return null;
      const marker = bin.charCodeAt(i + 1);
      const len = (bin.charCodeAt(i + 2) << 8) + bin.charCodeAt(i + 3);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        const h = (bin.charCodeAt(i + 5) << 8) + bin.charCodeAt(i + 6);
        const w = (bin.charCodeAt(i + 7) << 8) + bin.charCodeAt(i + 8);
        const comps = bin.charCodeAt(i + 9);
        return { bin, w, h, gray: comps === 1 };
      }
      i += 2 + len;
    }
  } catch {
    return null;
  }
  return null;
}

function toBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function build(pages, logo) {
  // objetos: 1 catálogo, 2 páginas, 3 F1, 4 F2, 5 logo (opcional), depois página+conteúdo
  const objects = [];
  const first = logo ? 6 : 5;
  const kids = pages.map((_, i) => `${first + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  if (logo) {
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /${logo.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bin.length} >>\nstream\n${logo.bin}\nendstream`);
  }
  const xobj = logo ? " /XObject << /Im1 5 0 R >>" : "";
  pages.forEach((cmds, i) => {
    const stream = cmds.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${first + i * 2 + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += String(off).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return toBytes(pdf);
}

function download(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function text(font, size, x, y, value) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function center(font, size, y, value) {
  const width = String(value || "").length * size * 0.5;
  return text(font, size, Math.max(40, Math.round(297 - width / 2)), y, value);
}

function textWidth(font, size, value) {
  let w = 0;
  for (const ch of String(value || "")) w += /[A-Z]/.test(ch) ? 0.68 : /[0-9$]/.test(ch) ? 0.56 : /[ .,]/.test(ch) ? 0.28 : 0.52;
  return w * size * (font === "F2" ? 1.06 : 1);
}

function right(font, size, xRight, y, value) {
  const width = textWidth(font, size, value);
  return text(font, size, Math.round(xRight - width), y, value);
}

const BOTTOM = 70; // margem de baixo; a assinatura pede 200 só no fim

export function paperBytes(kind, quote, profile) {
  const company = profile.business_name && profile.business_name !== "Meu serviço" ? profile.business_name : (profile.owner_name || "Prestador");
  const job = jobTitle(quote);
  const total = money(quote.price_cents);
  const city = profile.city || "Fortaleza";
  const date = dateBR();
  const items = itemsOf(quote);
  const logo = jpegInfo(profile.logo_data);

  const pages = [];
  let cmds = [];
  let y = 0;
  function newPage(cont) {
    cmds = ["0.15 0.15 0.15 RG 0.6 w"];
    pages.push(cmds);
    y = 790;
    if (cont) {
      cmds.push(text("F1", 9, 50, y, company + " - " + (kind === "recibo" ? "Recibo" : "Orcamento") + " " + quoteNumber(quote) + " (continuacao)"));
      y -= 24;
    }
  }
  function need(h) {
    if (y - h < BOTTOM) newPage(true);
  }

  newPage(false);
  if (logo) {
    const h = 56;
    const w = Math.round((logo.w / logo.h) * h);
    cmds.push(`q ${Math.min(w, 160)} 0 0 ${h} 50 ${y - 40} cm /Im1 Do Q`);
  }
  cmds.push(right("F1", 9, 545, y, quoteNumber(quote)));
  cmds.push(right("F1", 9, 545, y - 12, "Emitido em " + date));
  y -= 48;
  cmds.push("50 " + y + " m 545 " + y + " l S");
  y -= 18;
  cmds.push(center("F2", 12, y, company));
  y -= 16;
  [profile.owner_name && profile.owner_name !== company && profile.owner_name, profile.cnpj && "CNPJ " + profile.cnpj, profile.address_line, [formatPhone(profile.phone || profile.business_phone), profile.email].filter(Boolean).join("  /  "), city]
    .filter(Boolean)
    .forEach((line) => { cmds.push(center("F1", 9, y, line)); y -= 13; });
  y -= 16;
  cmds.push(center("F2", 16, y, kind === "recibo" ? "RECIBO" : "ORCAMENTO"));
  y -= 30;

  function table() {
    need(66);
    cmds.push("50 " + y + " m 545 " + y + " l 545 " + (y - 22) + " l 50 " + (y - 22) + " l h S");
    cmds.push(text("F2", 10, 58, y - 15, "SERVICO"));
    cmds.push(text("F2", 10, 380, y - 15, "QTD"));
    cmds.push(right("F2", 10, 537, y - 15, "VALOR"));
    y -= 22;
    items.forEach((item) => {
      const lines = wrap(item.name, 58);
      const h = 8 + lines.length * 13;
      need(h + 22);
      cmds.push("50 " + y + " m 545 " + y + " l 545 " + (y - h) + " l 50 " + (y - h) + " l h S");
      lines.forEach((line, i) => cmds.push(text("F1", 10, 58, y - 15 - i * 13, line)));
      cmds.push(text("F1", 10, 380, y - 15, String(lineQty(item)) + (lineQty(item) > 1 ? " x " + money(item.price_cents) : "")));
      cmds.push(right("F1", 10, 537, y - 15, money(lineTotal(item))));
      y -= h;
    });
    cmds.push("50 " + y + " m 545 " + y + " l 545 " + (y - 22) + " l 50 " + (y - 22) + " l h S");
    cmds.push(text("F2", 10, 58, y - 15, "TOTAL"));
    cmds.push(right("F2", 10, 537, y - 15, total));
    y -= 36;
  }
  function paragraph(label, value, size = 10) {
    const lines = wrap(value, 95);
    if (!lines.length) return;
    need(16 + lines.length * 14);
    if (label) { cmds.push(text("F2", size, 50, y, label)); y -= 15; }
    lines.forEach((line) => { need(14); cmds.push(text("F1", size, 50, y, line)); y -= 14; });
    y -= 6;
  }

  if (kind === "recibo") {
    cmds.push("0.15 0.15 0.15 RG 400 " + (y - 6) + " m 545 " + (y - 6) + " l 545 " + (y + 20) + " l 400 " + (y + 20) + " l h S");
    cmds.push(right("F2", 13, 535, y + 2, total));
    y -= 28;
    paragraph("", "Recebi de " + (quote.client_name || "cliente") + " o valor de " + total + ", referente a " + job + ".", 11);
    y -= 6;
    table();
    if (quote.address) paragraph("Local", quote.address);
    if (quote.description) paragraph("Observacao", quote.description);
  } else {
    paragraph("", job + " - " + (quote.client_name || ""), 12);
    table();
    paragraph("", "Prazo: " + (quote.deadline || "A combinar") + "   |   Pagamento: " + (quote.payment || "A vista, PIX"));
    paragraph("", "Endereco: " + (quote.address || "A combinar"));
    if (quote.scheduled_at) {
      paragraph("", "Visita: " + new Date(quote.scheduled_at).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    }
    if (quote.description) paragraph("Observacao", quote.description);
    if (profile.pix_key) paragraph("", "PIX: " + profile.pix_key);
  }
  if (y < 200) newPage(true);
  cmds.push(text("F1", 9, 230, 150, "Assinatura do prestador"));
  cmds.push("170 168 m 425 168 l S");
  cmds.push(center("F1", 10, 132, profile.owner_name || company));
  cmds.push(center("F1", 8, 116, "Campo para assinatura. Este documento nao e nota fiscal."));
  cmds.push(text("F1", 10, 360, 78, city + ", " + date));
  if (pages.length > 1) pages.forEach((page, i) => page.push(right("F1", 8, 545, 40, `Pagina ${i + 1} de ${pages.length}`)));
  return build(pages, logo);
}

export function openPaper(kind, quote, profile) {
  const name = (kind === "recibo" ? "recibo-" : "orcamento-") + quoteNumber(quote) + ".pdf";
  download(paperBytes(kind, quote, profile), name);
}

// Página do cliente: o próprio orçamento traz os dados da empresa (get_quote).
export function downloadQuotePdf(quote, profile) {
  openPaper("orcamento", quote, profile || quote);
}
