"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, supabaseReady, money, when } from "../../../lib/shared";
import { decodeQuote } from "../../../lib/demo";
import { downloadQuotePdf, quoteNumber } from "../../../lib/papers";

const EXAMPLE = {
  token: "demo",
  client_name: "Maria",
  address: "Aldeota, Fortaleza",
  service_name: "Limpeza de split",
  description: "Higienização completa de 1 evaporadora. Peça à parte, se precisar.",
  price_cents: 18000,
  status: "sent",
  scheduled_at: new Date(Date.now() + 86400000).toISOString(),
  business_name: "Ar do Samuca",
  pix_key: "85999990000",
  business_phone: "85999990000"
};

function avisar(quote, kind) {
  const back = `${window.location.origin}/painel?${kind}=${quote.token}`;
  const text = kind === "ok" ? `Aprovei o orçamento. ${back}` : `Recusei o orçamento. ${back}`;
  const digits = String(quote.business_phone || "").replace(/\D/g, "");
  const full = digits.length <= 11 ? "55" + digits : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export default function Cliente({ params }) {
  const [quote, setQuote] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const token = params.token;
    if (token === "demo") {
      setQuote(EXAMPLE);
      return;
    }
    const local = decodeQuote(token);
    if (local) {
      setQuote(local);
      return;
    }
    if (!supabaseReady()) {
      setMissing(true);
      return;
    }
    getSupabase().rpc("get_quote", { t: token }).then(({ data }) => {
      if (!data) setMissing(true);
      else setQuote(data);
    });
  }, [params.token]);

  async function decide(status) {
    const inner = quote.token;
    setQuote({ ...quote, status });
    if (supabaseReady() && inner && inner !== "demo") {
      const { data } = await getSupabase().rpc("client_set_status", { t: inner, new_status: status });
      if (data) setQuote({ ...quote, ...data, status });
    }
  }

  if (missing) return <main className="shell"><p>Orçamento não encontrado.</p></main>;
  if (!quote) return <main className="shell"><p className="muted">Abrindo orçamento.</p></main>;

  return (
    <main className="shell quote-hero">
      <Link className="brand" href="/">Visi<span>ta</span></Link>
      <p className="kicker">{quote.business_name} · {quoteNumber(quote)}</p>
      <h1>{quote.service_name}</h1>
      <p className="muted">Resumo do orçamento. O PDF é o mesmo papel, só mais formal.</p>
      <article className="card">
        <div className="split"><span>Cliente</span><b>{quote.client_name}</b></div>
        <div className="split"><span>Quando</span><b>{when(quote.scheduled_at)}</b></div>
        <div className="split"><span>Onde</span><b>{quote.address || "A combinar"}</b></div>
        <div className="split"><span>Incluso</span><b>{quote.description || "Conforme conversa"}</b></div>
        <div className="split"><span>Total</span><b className="price">{money(quote.price_cents)}</b></div>
      </article>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-ghost" onClick={() => downloadQuotePdf(quote)}>Baixar PDF</button>
      </div>
      {quote.status === "sent" && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => decide("approved")}>Aprovar</button>
          <button className="btn-ghost" onClick={() => decide("rejected")}>Recusar</button>
        </div>
      )}
      {quote.status === "approved" && (
        <article className="card" style={{ marginTop: 16 }}>
          <div className="kicker ok">Aprovado</div>
          <p>PIX: <b>{quote.pix_key || "o técnico manda no WhatsApp"}</b></p>
          <button className="btn" onClick={() => { window.location.href = avisar(quote, "ok"); }}>Avisar o técnico</button>
        </article>
      )}
      {quote.status === "rejected" && <button className="btn-ghost" onClick={() => { window.location.href = avisar(quote, "no"); }}>Avisar que recusou</button>}
      {["done", "paid"].includes(quote.status) && <p className="ok">Serviço {quote.status === "paid" ? "pago" : "marcado como feito"}.</p>}
    </main>
  );
}
