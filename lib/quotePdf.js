function pdfEscape(text) {
  const map = {
    á: "\\341", à: "\\340", ã: "\\343", â: "\\342",
    é: "\\351", ê: "\\352", í: "\\355",
    ó: "\\363", õ: "\\365", ô: "\\364",
    ú: "\\372", ç: "\\347",
    Á: "\\301", É: "\\311", Í: "\\315", Ó: "\\323", Ú: "\\332", Ç: "\\307",
    "–": "-", "—": "-"
  };
  return String(text || "")
    .replace(/[\\()]/g, (c) => "\\" + c)
    .replace(/[^\x20-\x7E]/g, (ch) => map[ch] || "?");
}

function wrap(text, size) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? line + " " + word : word;
    if (next.length > size) {
      if (line) lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function quoteNumber(quote) {
  const raw = String(quote.token || "demo").replace(/^d\./, "").slice(0, 6).toUpperCase();
  return "ORC-" + raw;
}

export function downloadQuotePdf(quote) {
  const issued = new Date().toLocaleDateString("pt-BR");
  const when = quote.scheduled_at
    ? new Date(quote.scheduled_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "A combinar";
  const total = (Number(quote.price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rows = [
    ["Cliente", quote.client_name],
    ["Endereco", quote.address || "A combinar"],
    ["Visita", when],
    ["Servico", quote.service_name],
    ["Incluso", quote.description || "Conforme conversa."],
    ["Total", total],
    ["PIX", quote.pix_key || "Enviado no WhatsApp"],
    ["Telefone", quote.business_phone || ""]
  ];

  let y = 760;
  const cmds = [
    "BT",
    "/F2 22 Tf",
    `50 ${y} Td (${pdfEscape("ORCAMENTO")}) Tj`,
    "ET",
    "BT",
    "/F1 11 Tf",
    `50 ${y - 22} Td (${pdfEscape(quote.business_name || "Prestador")}) Tj`,
    "ET",
    "BT",
    `/F1 10 Tf 400 ${y} Td (${pdfEscape(quoteNumber(quote))}) Tj ET`,
    `BT /F1 10 Tf 400 ${y - 16} Td (${pdfEscape("Emitido em " + issued)}) Tj ET`,
    `BT /F1 10 Tf 400 ${y - 32} Td (${pdfEscape("Valido por 7 dias")}) Tj ET`
  ];
  y = 690;
  rows.forEach(([label, value]) => {
    cmds.push(`BT /F2 10 Tf 50 ${y} Td (${pdfEscape(label)}) Tj ET`);
    wrap(value, 70).forEach((line, i) => {
      cmds.push(`BT /F1 11 Tf 160 ${y - i * 14} Td (${pdfEscape(line)}) Tj ET`);
    });
    y -= 18 + (wrap(value, 70).length - 1) * 14;
  });
  cmds.push(`BT /F1 9 Tf 50 80 Td (${pdfEscape("Este documento nao e nota fiscal. Pagamento por PIX, fora do site.")}) Tj ET`);
  cmds.push("0.88 0.65 0.23 RG 50 742 m 545 742 l S");

  const stream = cmds.join("\n");
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
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((off) => {
    pdf += String(off).padStart(10, "0") + " 00000 n \n";
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = quoteNumber(quote) + ".pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
