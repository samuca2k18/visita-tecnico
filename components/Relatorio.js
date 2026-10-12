"use client";

import { useState } from "react";
import { money, TZ } from "../lib/shared";
import { Icon } from "../lib/icons";

// "AAAA-MM" de uma data, no fuso de Fortaleza.
export function monthKey(d) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}

function shift(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 15));
  return d.toISOString().slice(0, 7);
}

function label(key) {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const sum = (list) => list.reduce((s, q) => s + (Number(q.price_cents) || 0), 0);

export function monthReport(quotes, key) {
  const enviados = quotes.filter((q) => q.created_at && monthKey(q.created_at) === key);
  const aprovados = enviados.filter((q) => ["approved", "done", "paid"].includes(q.status));
  const recusados = enviados.filter((q) => q.status === "rejected");
  const pagos = quotes.filter((q) => q.status === "paid" && monthKey(q.paid_at || q.updated_at || q.created_at) === key);
  const pendentes = enviados.filter((q) => ["approved", "done"].includes(q.status));
  // Quem deve: serviço aprovado/feito e não pago, de qualquer mês até o escolhido.
  const devendo = quotes.filter((q) => ["approved", "done"].includes(q.status) && q.created_at && monthKey(q.created_at) <= key);
  const porCliente = new Map();
  devendo.forEach((q) => {
    const k = (q.client_phone || q.client_name || "").toLowerCase();
    const cur = porCliente.get(k) || { name: q.client_name, phone: q.client_phone, total: 0, count: 0, done: 0 };
    cur.total += Number(q.price_cents) || 0;
    cur.count += 1;
    if (q.status === "done") cur.done += 1;
    porCliente.set(k, cur);
  });
  return {
    enviados: enviados.length, aprovados: aprovados.length, recusados: recusados.length,
    valorAprovado: sum(aprovados), faturado: sum(pagos), pagos: pagos.length,
    pendente: sum(pendentes), devendoTotal: sum(devendo),
    clientes: [...porCliente.values()].sort((a, b) => b.total - a.total)
  };
}

export default function Relatorio({ quotes }) {
  const now = monthKey(new Date());
  const [key, setKey] = useState(now);
  const r = monthReport(quotes, key);
  const taxa = r.enviados ? Math.round((r.aprovados / r.enviados) * 100) : 0;
  return (
    <div>
      <div className="page-title"><div><h1>Relatório</h1><p>{label(key)}</p></div></div>
      <div className="report-month">
        <button className="btn-ghost" type="button" aria-label="Mês anterior" onClick={() => setKey(shift(key, -1))}><Icon name="left" /></button>
        <input type="month" aria-label="Escolher mês" value={key} max={now} onChange={(e) => e.target.value && setKey(e.target.value)} />
        <button className="btn-ghost" type="button" aria-label="Próximo mês" disabled={key >= now} onClick={() => setKey(shift(key, 1))}><Icon name="right" /></button>
      </div>
      <div className="stats">
        <div className="stat main"><span>Faturado (pago)</span><b>{money(r.faturado)}</b></div>
        <div className="stat"><span>Pendente do mês</span><b>{money(r.pendente)}</b></div>
        <div className="stat"><span>Serviços pagos</span><b>{r.pagos}</b></div>
      </div>
      <section className="section">
        <div className="section-h"><span className="n"><Icon name="file" width="16" height="16" /></span><div><h2>Orçamentos do mês</h2><p>Criados em {label(key).toLowerCase()}.</p></div></div>
        <div className="split"><span>Enviados</span><b>{r.enviados}</b></div>
        <div className="split" style={{ marginTop: 6 }}><span>Aprovados</span><b>{r.aprovados} · {money(r.valorAprovado)}</b></div>
        <div className="split" style={{ marginTop: 6 }}><span>Recusados/cancelados</span><b>{r.recusados}</b></div>
        <div className="bar" role="img" aria-label={`${taxa}% aprovados`}><i style={{ width: taxa + "%" }} /></div>
        <p className="small muted" style={{ margin: "6px 0 0" }}>{r.enviados ? `${taxa}% dos orçamentos foram aprovados.` : "Nenhum orçamento criado neste mês."}</p>
      </section>
      <section className="section">
        <div className="section-h"><span className="n"><Icon name="money" width="16" height="16" /></span><div><h2>Quem ainda deve</h2><p>Aprovados ou feitos e não pagos, até este mês.</p></div></div>
        {r.clientes.length === 0
          ? <p className="muted" style={{ margin: 0 }}>Ninguém devendo. 🎉</p>
          : <>
              {r.clientes.map((c, i) => (
                <div className="owe" key={i}>
                  <div style={{ minWidth: 0 }}><span>{c.name}</span><small>{c.count} {c.count > 1 ? "serviços" : "serviço"}{c.done ? ` · ${c.done} já feito${c.done > 1 ? "s" : ""}` : ""}</small></div>
                  <b>{money(c.total)}</b>
                </div>
              ))}
              <div className="grand" style={{ marginTop: 8 }}><span>Total a receber</span><b>{money(r.devendoTotal)}</b></div>
            </>}
      </section>
    </div>
  );
}
