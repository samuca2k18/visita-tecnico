const WIN = {
  á: "\\341", à: "\\340", ã: "\\343", â: "\\342",
  é: "\\351", ê: "\\352", í: "\\355",
  ó: "\\363", õ: "\\365", ô: "\\364",
  ú: "\\372", ç: "\\347",
  Á: "\\301", À: "\\300", Ã: "\\303", Â: "\\302",
  É: "\\311", Ê: "\\312", Í: "\\315",
  Ó: "\\323", Õ: "\\325", Ô: "\\324",
  Ú: "\\332", Ç: "\\307"
};

function pdfText(value) {
  return String(value || "")
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

function download(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function build(lines) {
  const stream = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((off) => { pdf += String(off).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function text(font, size, x, y, value) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function center(font, size, y, value) {
  const width = String(value || "").length * size * 0.5;
  return text(font, size, Math.max(40, 297 - width / 2), y, value);
}

export function openPaper(kind, quote, profile) {
  const company = profile.business_name && profile.business_name !== "Meu serviço" ? profile.business_name : (profile.owner_name || "Prestador");
  const job = jobTitle(quote);
  const total = money(quote.price_cents);
  const city = profile.city || "Fortaleza";
  const date = new Date().toLocaleDateString("pt-BR");
  const cmds = ["0.15 0.15 0.15 RG", "50 760 m 545 760 l S"];
  let y = 742;
  cmds.push(center("F2", 12, y, company));
  y -= 16;
  [profile.cnpj && "CNPJ " + profile.cnpj, profile.address_line, [profile.phone || profile.business_phone, profile.email].filter(Boolean).join("  /  "), city]
    .filter(Boolean)
    .forEach((line) => { cmds.push(center("F1", 9, y, line)); y -= 13; });
  y -= 16;
  cmds.push(center("F2", 16, y, kind === "recibo" ? "RECIBO" : "ORCAMENTO"));
  y -= 28;
  if (kind === "recibo") {
    cmds.push(text("F2", 12, 430, y + 8, total));
    cmds.push("0.15 0.15 0.15 RG 420 " + (y - 4) + " m 545 " + (y - 4) + " l 545 " + (y + 22) + " l 420 " + (y + 22) + " l 420 " + (y - 4) + " l S");
    y -= 20;
    cmds.push(text("F1", 11, 50, y, "Recebi de " + quote.client_name + " o valor de " + total + ","));
    y -= 16;
    cmds.push(text("F1", 11, 50, y, "referente a " + job + "."));
    y -= 28;
    cmds.push(text("F2", 11, 50, y, "Servicos compreendidos"));
    y -= 16;
    String(quote.description || job).split(/\n/).filter(Boolean).forEach((line) => {
      cmds.push(text("F1", 11, 58, y, "- " + line));
      y -= 15;
    });
    y -= 10;
    cmds.push(text("F2", 11, 50, y, "Prazo"));
    y -= 16;
    cmds.push(text("F1", 11, 50, y, quote.deadline || "A combinar"));
  } else {
    cmds.push(text("F2", 12, 50, y, job));
    y -= 16;
    cmds.push(text("F2", 12, 50, y, quote.client_name || ""));
    y -= 22;
    const items = (quote.items && quote.items.length) ? quote.items : [{ name: job, price_cents: quote.price_cents }];
    cmds.push(text("F2", 12, 50, y, quote.client_name || ""));
    y -= 22;
    cmds.push("0.15 0.15 0.15 RG 50 " + y + " m 545 " + y + " l 545 " + (y - 22) + " l 50 " + (y - 22) + " l S");
    cmds.push(text("F2", 10, 58, y - 15, "SERVICO"));
    cmds.push(text("F2", 10, 430, y - 15, "VALOR"));
    y -= 22;
    items.forEach((item) => {
      cmds.push("50 " + y + " m 545 " + y + " l 545 " + (y - 22) + " l 50 " + (y - 22) + " l S");
      cmds.push(text("F1", 10, 58, y - 15, String(item.name || "").slice(0, 42)));
      cmds.push(text("F1", 10, 430, y - 15, money(item.price_cents)));
      y -= 22;
    });
    cmds.push("50 " + y + " m 545 " + y + " l 545 " + (y - 22) + " l 50 " + (y - 22) + " l S");
    cmds.push(text("F2", 10, 58, y - 15, "TOTAL"));
    cmds.push(text("F2", 10, 430, y - 15, total));
    y -= 36;
    cmds.push(text("F2", 10, 50, y, "Prazo: " + (quote.deadline || "A combinar") + "   |   Pagamento: " + (quote.payment || "A vista, PIX")));
    y -= 16;
    cmds.push(text("F1", 10, 50, y, "Endereco: " + (quote.address || "A combinar") + "   Documento " + quoteNumber(quote)));
    if (quote.description) {
      y -= 16;
      cmds.push(text("F1", 10, 50, y, quote.description.slice(0, 90)));
    }
  }
  cmds.push(text("F1", 9, 230, 150, "Assinatura do prestador"));
  cmds.push("170 168 m 425 168 l S");
  cmds.push(center("F1", 10, 132, profile.owner_name || company));
  cmds.push(center("F1", 8, 116, "Campo para assinatura digital. O arquivo nao assina sozinho."));
  cmds.push(text("F1", 10, 360, 78, city + ", " + date));
  const name = (kind === "recibo" ? "recibo-" : "orcamento-") + quoteNumber(quote) + ".pdf";
  download(build(cmds), name);
}

export function downloadQuotePdf(quote, profile) {
  openPaper("orcamento", quote, profile || quote);
}
