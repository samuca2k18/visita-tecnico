"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, supabaseReady, money, when, itemsOf, lineQty, lineTotal, whatsAppLink, formatPhone, STATUS } from "../../../lib/shared";
import { Icon, WhatsAppIcon } from "../../../lib/icons";
import { decodeQuote } from "../../../lib/demo";
import { downloadQuotePdf, quoteNumber } from "../../../lib/papers";

const EXAMPLE = {
  token: "demo",
  client_name: "Maria",
  address: "Aldeota, Fortaleza",
  service_name: "Limpeza de split",
  description: "Higienização completa de 1 evaporadora. Peça à parte, se precisar.",
  items: [{ name: "Limpeza de split", qty: 1, price_cents: 18000 }],
  price_cents: 18000,
  status: "sent",
  deadline: "No dia",
  payment: "À vista, PIX",
  scheduled_at: new Date(Date.now() + 86400000).toISOString(),
  business_name: "Ar do Samuca (exemplo)",
  pix_key: "chave-de-exemplo",
  business_phone: "",
  example: true
};

// Com Supabase ligado, nada do que vem escrito no link é mostrado: só o token interno é usado
// para buscar o orçamento no servidor. Assim ninguém monta um link falso com outra chave PIX.
function serverToken(token) {
  if (!token?.startsWith("d.")) return token;
  return decodeQuote(token)?.token || "";
}

export default function Cliente({ params }) {
  const [quote, setQuote] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const live = supabaseReady();

  useEffect(() => {
    const token = decodeURIComponent(params.token || "");
    if (token === "demo") {
      setQuote(EXAMPLE);
      return;
    }
    if (!live) {
      const local = decodeQuote(token);
      if (local) setQuote(local);
      else setMissing(true);
      return;
    }
    const t = serverToken(token);
    if (!t) {
      setMissing(true);
      return;
    }
    getSupabase().rpc("get_quote", { t }).then(({ data, error }) => {
      if (error || !data) setMissing(true);
      else setQuote(data);
    });
  }, [params.token, live]);

  async function decide(status) {
    setMsg("");
    if (quote.example || !live) {
      setQuote({ ...quote, status });
      return;
    }
    setBusy(true);
    const { data, error } = await getSupabase().rpc("client_set_status", { t: quote.token, new_status: status });
    setBusy(false);
    if (error || !data) {
      setMsg("Não consegui registrar agora. Confere a internet e tenta de novo.");
      return;
    }
    setQuote(data);
    if (data.status !== status) setMsg("Esse orçamento já tinha sido respondido. A situação abaixo é a que está valendo.");
  }

  function avisar(kind) {
    const base = kind === "ok" ? `Aprovei o orçamento ${quoteNumber(quote)}.` : `Recusei o orçamento ${quoteNumber(quote)}.`;
    const text = live ? base : `${base} ${window.location.origin}/painel?${kind}=${quote.token}`;
    return whatsAppLink(quote.business_phone, text);
  }

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(quote.pix_key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (missing) {
    return (
      <main className="client">
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="ico"><Icon name="info" /></div>
          <h3>Orçamento não encontrado</h3>
          <p>Confere o link com quem te mandou.</p>
        </div>
      </main>
    );
  }
  if (!quote) return <main className="client"><p className="muted" style={{ marginTop: 40, textAlign: "center" }}>Abrindo orçamento…</p></main>;

  const items = itemsOf(quote);
  const okLink = quote.status === "approved" ? avisar("ok") : "";
  const noLink = quote.status === "rejected" ? avisar("no") : "";
  const banner = {
    sent: ["clock", "Aguardando sua resposta", "Confira os itens e aprove ou recuse abaixo."],
    approved: ["check", "Orçamento aprovado", "Obrigado! Combine os detalhes com o técnico."],
    rejected: ["x", "Orçamento recusado ou cancelado", "Se mudou de ideia, fale com o técnico."],
    done: ["check", "Serviço feito", "O técnico marcou este serviço como concluído."],
    paid: ["check", "Serviço pago", "Pagamento confirmado. Obrigado!"]
  }[quote.status] || ["info", STATUS[quote.status] || quote.status, ""];
  const contact = [quote.city, formatPhone(quote.business_phone)].filter(Boolean).join(" · ");

  return (
    <main className="client">
      <article className="card client-head">
        {quote.logo_data
          ? <img className="logo" src={quote.logo_data} alt="" />
          : <div className="initial" aria-hidden="true">{String(quote.business_name || "?").trim().charAt(0).toUpperCase()}</div>}
        <div style={{ minWidth: 0 }}>
          <h1>{quote.business_name}</h1>
          <p>{[quote.cnpj && "CNPJ " + quote.cnpj, contact].filter(Boolean).join(" · ") || "Orçamento de serviço"}</p>
        </div>
      </article>

      {quote.example && <p className="small muted" style={{ textAlign: "center", margin: "12px 0 0" }}>Orçamento de exemplo. Os dados são fictícios.</p>}

      <div className={"banner " + quote.status} role="status">
        <Icon name={banner[0]} />
        <div>{banner[1]}{banner[2] && <small>{banner[2]}</small>}</div>
      </div>

      <article className="card doc">
        <div className="doc-title">
          <div className="kicker">Orçamento {quoteNumber(quote)}</div>
          <h2>{quote.service_name}</h2>
        </div>
        <div className="facts">
          <div><span>Cliente</span><b>{quote.client_name}</b></div>
          <div><span>Quando</span><b>{when(quote.scheduled_at)}</b></div>
          <div style={{ gridColumn: "1 / -1" }}><span>Onde</span><b>{quote.address || "A combinar"}</b></div>
          {quote.deadline && <div><span>Prazo</span><b>{quote.deadline}</b></div>}
          {quote.payment && <div><span>Pagamento</span><b>{quote.payment}</b></div>}
        </div>
        <table className="items">
          <thead><tr><th>Serviço</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>{item.name}{lineQty(item) > 1 && <small>{lineQty(item)} × {money(item.price_cents)}</small>}</td>
                <td className="num">{money(lineTotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {quote.description && <div className="note"><b>Observação</b><br />{quote.description}</div>}
        <div className="grand"><span>Total</span><b>{money(quote.price_cents)}</b></div>
      </article>

      {msg && <p className="error" role="alert">{msg}</p>}

      {quote.status === "sent" && (
        <div className="decide">
          <button className="btn btn-lg" disabled={busy} onClick={() => decide("approved")}><Icon name="check" />{busy ? "Enviando" : "Aprovar"}</button>
          <button className="btn-ghost btn-lg" disabled={busy} onClick={() => decide("rejected")}>Recusar</button>
        </div>
      )}

      {quote.status === "approved" && (
        <article className="card pix">
          <div className="kicker">Pagamento por PIX</div>
          {quote.pix_key ? (
            <div className="key">
              <code>{quote.pix_key}</code>
              <button className="btn-soft" onClick={copyPix}><Icon name={copied ? "check" : "copy"} />{copied ? "Copiado" : "Copiar chave"}</button>
            </div>
          ) : <p className="muted" style={{ margin: "8px 0 0" }}>O técnico manda a chave PIX no WhatsApp.</p>}
          {okLink && <a className="btn-wa btn-lg btn-block" style={{ marginTop: 12 }} href={okLink}><WhatsAppIcon />Avisar o técnico no WhatsApp</a>}
        </article>
      )}
      {noLink && <a className="btn-ghost btn-block" style={{ marginTop: 12 }} href={noLink}><WhatsAppIcon />Avisar que recusou</a>}

      <div className="row" style={{ marginTop: 16, justifyContent: "center" }}>
        <button className="btn-ghost" onClick={() => downloadQuotePdf(quote)}><Icon name="file" />Baixar PDF</button>
      </div>
      <p className="trust">Orçamento enviado por {quote.business_name} usando <Link href="/">Visita</Link>. Este documento não é nota fiscal.</p>
    </main>
  );
}
