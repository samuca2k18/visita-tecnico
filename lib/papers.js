function esc(value) {
  return String(value || "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function today() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function quoteNumber(quote) {
  const raw = String(quote.token || "demo").replace(/^d\./, "").slice(0, 6).toUpperCase();
  return "ORC-" + raw;
}

function header(profile) {
  const logo = profile.logo_data
    ? `<img class="logo" src="${profile.logo_data}" alt="Logo">`
    : "";
  return `
    ${logo}
    <div class="company">${esc(profile.business_name || "Prestador")}</div>
    <div class="meta">
      ${profile.cnpj ? `C.N.P.J: ${esc(profile.cnpj)}<br>` : ""}
      ${esc(profile.address_line || profile.city || "")}<br>
      ${profile.phone ? `Fone: ${esc(profile.phone)}<br>` : ""}
      ${profile.email ? esc(profile.email) : ""}
    </div>
  `;
}

function signature(profile) {
  return `
    <div class="sign">
      <div class="sign-box">Assinatura do prestador</div>
      <div class="sign-name">${esc(profile.owner_name || profile.business_name || "")}</div>
      <p class="hint">Sem assinatura neste arquivo. Recomendado aplicar assinatura digital, gov.br ou do app do banco, sobre o campo acima.</p>
    </div>
    <div class="place">${esc(profile.city || "Fortaleza")}, ${today()}</div>
  `;
}

function page(title, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1b1b1b; margin: 36px; }
    .logo { display: block; height: 78px; margin: 0 auto 10px; object-fit: contain; }
    .company { text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.02em; }
    .meta { text-align: center; font-size: 12px; line-height: 1.45; margin-top: 4px; }
    h1 { text-align: center; letter-spacing: 0.18em; font-size: 22px; margin: 28px 0 16px; }
    .who { font-weight: 700; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
    th, td { border: 1px solid #222; padding: 8px 10px; font-size: 13px; }
    th { text-align: left; }
    td.val, th.val { text-align: right; }
    tr.total td { font-weight: 700; background: #f3f3f3; }
    .foot { font-size: 13px; font-weight: 700; }
    .amount { float: right; border: 1px solid #222; padding: 8px 14px; font-weight: 700; }
    .clear { clear: both; }
    ul { margin: 6px 0 16px; }
    .sign { margin-top: 42px; text-align: center; }
    .sign-box { width: 280px; height: 72px; margin: 0 auto 6px; border-bottom: 1px solid #222; color: #888; font-size: 12px; display: flex; align-items: flex-end; justify-content: center; }
    .sign-name { font-size: 13px; }
    .hint { font-size: 11px; color: #555; max-width: 420px; margin: 8px auto 0; }
    .place { text-align: right; margin-top: 28px; font-size: 13px; }
  </style></head><body>${body}</body></html>`;
}

function lineItems(quote) {
  if (Array.isArray(quote.items) && quote.items.length) {
    return quote.items.map((item) => {
      const qty = Math.max(1, Number(item.qty) || 1);
      const price = Number(item.price_cents) || 0;
      const name = qty > 1 ? qty + "× " + item.name : item.name;
      return { name, total: price * qty };
    });
  }
  const notes = (quote.description || "").split(/\n|•/).map((s) => s.trim()).filter(Boolean);
  const rows = [{ name: quote.service_name, total: Number(quote.price_cents) || 0 }];
  notes.filter((note) => note !== quote.service_name).forEach((note) => rows.push({ name: note, total: null }));
  return rows;
}

export function openPaper(kind, quote, profile) {
  const items = lineItems(quote);
  const sum = items.reduce((acc, item) => acc + (item.total || 0), 0);
  const total = money(quote.price_cents || sum);
  const prazo = quote.deadline || "A combinar";
  const pay = quote.payment || "À vista, PIX";
  const names = items.map((item) => item.name).join(", ");
  let body = header(profile);
  if (kind === "recibo") {
    body += `<h1>R E C I B O</h1><div class="amount">${total}</div><div class="clear"></div>
      <p>RECEBI DE <b>${esc(quote.client_name)}</b> O VALOR DE <b>${total}</b>, REFERENTE A ${esc(names)}.</p>
      <div class="foot">SERVIÇOS COMPREENDIDOS</div>
      <ul>${items.map((item) => `<li>${esc(item.name)}${item.total != null ? " — " + money(item.total) : ""}</li>`).join("")}</ul>
      <div class="foot">PRAZO DE ENTREGA</div>
      <p>${esc(prazo)}</p>`;
  } else {
    body += `<h1>ORÇAMENTO</h1>
      <p class="who">${esc(quote.client_name)}</p>
      <table>
        <thead><tr><th>SERVIÇO</th><th class="val">VALOR</th></tr></thead>
        <tbody>
          ${items.map((item) => `<tr><td>${esc(item.name)}</td><td class="val">${item.total != null ? money(item.total) : ""}</td></tr>`).join("")}
          <tr class="total"><td>TOTAL</td><td class="val">${total}</td></tr>
        </tbody>
      </table>
      <p class="foot">PRAZO: ${esc(prazo)} &nbsp;|&nbsp; FORMA DE PAGAMENTO: ${esc(pay)}</p>
      <p>Endereço do serviço: ${esc(quote.address || "A combinar")}. Documento nº ${esc(quoteNumber(quote))}.</p>`;
  }
  body += signature(profile);
  const html = page(kind === "recibo" ? "Recibo" : "Orçamento", body);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function downloadQuotePdf(quote, profile) {
  openPaper("orcamento", quote, profile || quote);
}
