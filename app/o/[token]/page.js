"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, supabaseReady, money, when, itemsOf, lineQty, lineTotal, whatsAppLink } from "../../../lib/shared";
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

  if (missing) return <main className="shell"><p>Orçamento não encontrado. Confere o link com quem te mandou.</p></main>;
  if (!quote) return <main className="shell"><p className="muted">Abrindo orçamento.</p></main>;

  const items = itemsOf(quote);
  const okLink = quote.status === "approved" ? avisar("ok") : "";
  const noLink = quote.status === "rejected" ? avisar("no") : "";

  return (
    <main className="shell quote-hero">
      <Link className="brand" href="/">Visi<span>ta</span></Link>
      {quote.logo_data && <img src={quote.logo_data} alt="" style={{ height: 48, display: "block", marginTop: 12 }} />}
      <p className="kicker">{quote.business_name} · {quoteNumber(quote)}</p>
      <h1>{quote.service_name}</h1>
      {quote.example && <p className="small muted">Orçamento de exemplo. Os dados são fictícios.</p>}
      <article className="card">
        <div className="split"><span>Cliente</span><b>{quote.client_name}</b></div>
        <div className="split"><span>Quando</span><b>{when(quote.scheduled_at)}</b></div>
        <div className="split"><span>Onde</span><b>{quote.address || "A combinar"}</b></div>
        {items.map((item, i) => (
          <div className="split" key={i}><span>{lineQty(item) > 1 ? `${lineQty(item)}× ` : ""}{item.name}</span><b>{money(lineTotal(item))}</b></div>
        ))}
        {quote.description && <div className="split"><span>Observação</span><b>{quote.description}</b></div>}
        {quote.deadline && <div className="split"><span>Prazo</span><b>{quote.deadline}</b></div>}
        {quote.payment && <div className="split"><span>Pagamento</span><b>{quote.payment}</b></div>}
        <div className="split"><span>Total</span><b className="price">{money(quote.price_cents)}</b></div>
      </article>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-ghost" onClick={() => downloadQuotePdf(quote)}>Baixar PDF</button>
      </div>
      {msg && <p className="error">{msg}</p>}
      {quote.status === "sent" && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={() => decide("approved")}>{busy ? "Enviando" : "Aprovar"}</button>
          <button className="btn-ghost" disabled={busy} onClick={() => decide("rejected")}>Recusar</button>
        </div>
      )}
      {quote.status === "approved" && (
        <article className="card" style={{ marginTop: 16 }}>
          <div className="kicker ok">Aprovado</div>
          {quote.pix_key
            ? <p>PIX: <b>{quote.pix_key}</b> <button className="btn-ghost" onClick={copyPix}>{copied ? "Copiado" : "Copiar chave"}</button></p>
            : <p>O técnico manda a chave PIX no WhatsApp.</p>}
          {okLink && <a className="btn" href={okLink}>Avisar o técnico no WhatsApp</a>}
        </article>
      )}
      {quote.status === "rejected" && <p className="no">Orçamento recusado ou cancelado.</p>}
      {noLink && <a className="btn-ghost" href={noLink}>Avisar que recusou</a>}
      {["done", "paid"].includes(quote.status) && <p className="ok">Serviço {quote.status === "paid" ? "pago" : "marcado como feito"}.</p>}
    </main>
  );
}
