"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getSupabase, supabaseReady, money, when, uid, STATUS, parseBRL, centsToInput, dayKey,
  toLocalInput, fromLocalInput, normalizePhone, formatPhone, whatsAppLink, itemsOf, lineQty, lineTotal
} from "../../lib/shared";
import { loadDemo, saveDemo, encodeQuote, loadExtra, saveExtra, shrinkLogo } from "../../lib/demo";
import { openPaper } from "../../lib/papers";

const PROFILE_FIELDS = ["business_name", "owner_name", "cnpj", "address_line", "city", "phone", "email", "pix_key", "logo_data"];
const DEFAULT_PROFILE = { business_name: "Meu serviço", owner_name: "", cnpj: "", address_line: "", city: "Fortaleza", phone: "", email: "", pix_key: "", logo_data: "" };

function traduz(msg) {
  const m = String(msg || "");
  if (/email rate limit/i.test(m)) return "O Supabase limitou o envio de e-mail. Espera cerca de uma hora, ou entra com a conta que já existe.";
  if (/anonymous sign-ins are disabled/i.test(m)) return "Preencha o e-mail e a senha.";
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered|already been registered/i.test(m)) return "Esse e-mail já tem conta. Use Entrar.";
  if (/failed to fetch|network/i.test(m)) return "Sem conexão com o servidor. Confere a internet.";
  if (/jwt|session/i.test(m)) return "Sua sessão expirou. Sai e entra de novo.";
  return m || "Algo deu errado. Tenta de novo.";
}

function cleanProfile(p) {
  const out = {};
  PROFILE_FIELDS.forEach((k) => { out[k] = String(p?.[k] ?? DEFAULT_PROFILE[k] ?? ""); });
  if (!out.business_name.trim()) out.business_name = "Meu serviço";
  return out;
}

export default function Painel() {
  const live = supabaseReady();
  const [tab, setTab] = useState("hoje");
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState({ text: "", bad: false });
  const [draft, setDraft] = useState(null);
  const [draftKey, setDraftKey] = useState(0);

  function say(text, bad = false) { setNotice({ text, bad }); }

  useEffect(() => {
    if (!live) {
      setData(loadDemo());
      setSession({ demo: true });
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data: d }) => setSession(d.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [live]);

  useEffect(() => {
    if (!live || !session?.user) return;
    refresh();
  }, [live, session?.user?.id]);

  useEffect(() => {
    if (!data || live) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("ok") || params.get("no");
    if (!token) return;
    const status = params.get("ok") ? "approved" : "rejected";
    persist({ ...data, quotes: data.quotes.map((q) => q.token === token ? { ...q, status } : q) });
    window.history.replaceState({}, "", "/painel");
  }, [data]);

  async function refresh() {
    const sb = getSupabase();
    const user = session.user;
    const [p, s, q] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("services").select("*").eq("user_id", user.id).order("created_at"),
      sb.from("quotes").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    ]);
    const err = p.error || s.error || q.error;
    if (err) say("Não consegui carregar tudo do servidor: " + traduz(err.message), true);
    const extra = loadExtra();
    // Campos que antes ficavam só neste navegador: usa como reserva e sobe para a conta.
    const server = cleanProfile(p.data || {});
    const local = extra.profile || {};
    const merged = { ...server };
    let migrate = false;
    ["owner_name", "cnpj", "address_line", "email", "logo_data"].forEach((k) => {
      if (!merged[k] && local[k]) { merged[k] = String(local[k]); migrate = true; }
    });
    if (migrate && !err) {
      const { error: upErr } = await sb.from("profiles").upsert({ id: user.id, ...merged });
      if (!upErr) say("Os dados da empresa que estavam só neste aparelho agora estão salvos na sua conta.");
    }
    setData({
      profile: merged,
      services: s.data || [],
      quotes: (q.data || []).map((row) => {
        const old = extra.quotes?.[row.token] || {};
        return { ...row, deadline: row.deadline || old.deadline || "", payment: row.payment || old.payment || "" };
      })
    });
  }

  function persist(next) {
    setData(next);
    if (!live) saveDemo(next);
  }

  function readCreds(e) {
    const form = e?.currentTarget?.form || e?.currentTarget;
    const em = String(form?.elements?.email?.value ?? email).trim();
    const pw = String(form?.elements?.password?.value ?? password);
    const hp = String(form?.elements?.website?.value ?? website);
    return { em, pw, hp };
  }

  async function signIn(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const { em, pw } = readCreds(e);
    if (!em || !pw) return setError("Preencha o e-mail e a senha.");
    setAuthBusy(true);
    const { error: err } = await getSupabase().auth.signInWithPassword({ email: em, password: pw });
    setAuthBusy(false);
    if (err) setError(traduz(err.message));
  }

  async function signUp(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const { em, pw, hp } = readCreds(e);
    if (!em || !pw) return setError("Preencha o e-mail e a senha para criar a conta.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError("Esse e-mail não parece válido.");
    if (pw.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    setAuthBusy(true);
    const sb = getSupabase();
    const { data: res, error: err } = await sb.functions.invoke("criar-conta", { body: { email: em, password: pw, website: hp } });
    if (err || res?.error) {
      setAuthBusy(false);
      return setError(res?.error || "Não consegui criar a conta agora. Tenta de novo em alguns minutos.");
    }
    setInfo("Conta criada. Entrando.");
    const { error: inErr } = await sb.auth.signInWithPassword({ email: em, password: pw });
    setAuthBusy(false);
    if (inErr) setError(traduz(inErr.message));
  }

  async function saveProfile(profile) {
    say("");
    let logo_data = profile.logo_data || "";
    if (logo_data.startsWith("data:") && !logo_data.startsWith("data:image/jpeg")) logo_data = await shrinkLogo(logo_data);
    if (logo_data.length > 200000) logo_data = await shrinkLogo(logo_data);
    const next = cleanProfile({ ...profile, logo_data, phone: normalizePhone(profile.phone) || profile.phone });
    const extra = loadExtra();
    extra.profile = next;
    saveExtra(extra);
    persist({ ...data, profile: next });
    if (!live) return say("Salvo neste aparelho.");
    const { error: err } = await getSupabase().from("profiles").upsert({ id: session.user.id, ...next });
    if (err) say("Salvo só neste aparelho. O servidor recusou: " + traduz(err.message), true);
    else say("Salvo na sua conta.");
  }

  async function addQuote(payload) {
    const token = uid();
    const row = { ...payload, token, status: "sent" };
    if (!live) {
      persist({ ...data, quotes: [row, ...data.quotes] });
      return { link: `${window.location.origin}/o/${encodeQuote(row, data.profile)}`, quote: row };
    }
    const { error: err } = await getSupabase().from("quotes").insert({ ...payload, token, status: "sent", user_id: session.user.id });
    if (err) return { error: "Não gravei o orçamento: " + traduz(err.message) };
    await refresh();
    return { link: `${window.location.origin}/o/${token}`, quote: row };
  }

  async function updateQuote(token, patch) {
    if (!live) {
      persist({ ...data, quotes: data.quotes.map((q) => q.token === token ? { ...q, ...patch } : q) });
      return {};
    }
    const { error: err } = await getSupabase().from("quotes").update({ ...patch, updated_at: new Date().toISOString() }).eq("token", token);
    if (err) return { error: "Não salvei: " + traduz(err.message) };
    await refresh();
    return {};
  }

  async function setStatus(token, status) {
    const res = await updateQuote(token, { status });
    if (res.error) say(res.error, true);
  }

  async function addService(service) {
    if (!live) {
      persist({ ...data, services: [...data.services, { ...service, id: uid(), active: true }] });
      return {};
    }
    const { error: err } = await getSupabase().from("services").insert({ ...service, user_id: session.user.id });
    if (err) return { error: "Não salvei o serviço: " + traduz(err.message) };
    await refresh();
    return {};
  }

  async function updateService(id, patch) {
    if (!live) {
      persist({ ...data, services: data.services.map((s) => s.id === id ? { ...s, ...patch } : s) });
      return {};
    }
    const { error: err } = await getSupabase().from("services").update(patch).eq("id", id);
    if (err) return { error: "Não salvei o serviço: " + traduz(err.message) };
    await refresh();
    return {};
  }

  function linkFor(q) {
    return live ? `${window.location.origin}/o/${q.token}` : `${window.location.origin}/o/${encodeQuote(q, data.profile)}`;
  }

  function duplicate(q) {
    setDraft({ ...q, token: undefined, status: "sent", scheduled_at: null });
    setDraftKey((k) => k + 1);
    setTab("novo");
  }

  if (!session) {
    return (
      <main className="shell">
        <div className="top"><Link className="brand" href="/">Visi<span>ta</span></Link></div>
        <form className="card" onSubmit={signIn} noValidate>
          <div className="kicker">Técnico</div>
          <h2>Entrar</h2>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
          <div className="hp" aria-hidden="true">
            <label htmlFor="website">Site</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          {info && <p className="muted">{info}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" type="submit" disabled={authBusy}>Entrar</button>
            <button className="btn-ghost" type="button" disabled={authBusy} onClick={signUp}>Criar conta</button>
          </div>
          <p className="small muted">Pra criar conta, coloque seu e-mail e uma senha de pelo menos 6 caracteres e toque em Criar conta.</p>
        </form>
      </main>
    );
  }

  if (!data) return <main className="shell"><p className="muted">Carregando.</p></main>;

  return (
    <main className="shell">
      <div className="top">
        <Link className="brand" href="/">Visi<span>ta</span></Link>
        <span className="muted small">{live ? "Conta online" : "Ensaio neste aparelho"}</span>
      </div>
      {notice.text && (
        <p className={notice.bad ? "error" : "small"}>
          {notice.text} <button className="link" onClick={() => say("")}>fechar</button>
        </p>
      )}
      <div className="tabs">
        {["hoje", "novo", "servicos", "ajustes"].map((id) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {id === "hoje" ? "Hoje" : id === "novo" ? "Novo" : id === "servicos" ? "Serviços" : "Ajustes"}
          </button>
        ))}
      </div>
      {tab === "hoje" && <Hoje data={data} setStatus={setStatus} updateQuote={updateQuote} linkFor={linkFor} duplicate={duplicate} />}
      {tab === "novo" && (
        <Novo key={draftKey} data={data} initial={draft} addQuote={addQuote} onDone={() => setDraft(null)} />
      )}
      {tab === "servicos" && <Servicos data={data} addService={addService} updateService={updateService} />}
      {tab === "ajustes" && <Ajustes data={data} saveProfile={saveProfile} live={live} onOut={() => live ? getSupabase().auth.signOut() : null} />}
    </main>
  );
}

function shareText(q, link) {
  return `Olá${q.client_name ? ", " + q.client_name.split(" ")[0] : ""}! Segue o orçamento de ${q.service_name} (${money(q.price_cents)}): ${link}`;
}

function Hoje({ data, setStatus, updateQuote, linkFor, duplicate }) {
  const [filter, setFilter] = useState("proximos");
  const [editing, setEditing] = useState("");
  const [copied, setCopied] = useState("");
  const today = dayKey(new Date());

  async function copy(q) {
    try {
      await navigator.clipboard.writeText(linkFor(q));
      setCopied(q.token);
    } catch {
      window.prompt("Copie o link:", linkFor(q));
    }
  }

  const open = (q) => ["sent", "approved", "done"].includes(q.status);
  let list = data.quotes.filter((q) => {
    if (filter === "todos") return true;
    if (filter === "hoje") return q.scheduled_at && dayKey(q.scheduled_at) === today;
    return open(q) && (!q.scheduled_at || dayKey(q.scheduled_at) >= today);
  });
  const ts = (q) => (q.scheduled_at ? new Date(q.scheduled_at).getTime() : null);
  list = [...list].sort((a, b) => {
    if (filter === "todos") return (ts(b) ?? new Date(b.created_at || 0).getTime()) - (ts(a) ?? new Date(a.created_at || 0).getTime());
    if (ts(a) === null && ts(b) === null) return 0;
    if (ts(a) === null) return 1;
    if (ts(b) === null) return -1;
    return ts(a) - ts(b);
  });

  function cancel(q) {
    if (window.confirm(`Cancelar o orçamento de ${q.client_name}? No link do cliente ele aparece como recusado/cancelado.`)) setStatus(q.token, "rejected");
  }

  return (
    <div>
      <div className="chips">
        {[["hoje", "Hoje"], ["proximos", "Próximos"], ["todos", "Todos"]].map(([id, label]) => (
          <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="list">
        {list.length === 0 && (
          <p className="muted">
            {data.quotes.length === 0 ? "Nenhum orçamento ainda. Aba Novo." : filter === "hoje" ? "Nada marcado pra hoje." : "Nada em aberto. Veja Todos."}
          </p>
        )}
        {list.map((q) => editing === q.token ? (
          <QuoteForm
            key={q.token}
            services={data.services}
            initial={q}
            submitLabel="Salvar alterações"
            onCancel={() => setEditing("")}
            onSubmit={async (payload) => {
              const res = await updateQuote(q.token, payload);
              if (!res.error) setEditing("");
              return res;
            }}
          />
        ) : (
          <article key={q.token} className="item">
            <div className="split">
              <b>{q.client_name} · {q.service_name}</b>
              <span className={"pill " + q.status}>{STATUS[q.status]}</span>
            </div>
            <p className="small muted">{when(q.scheduled_at)} · {q.address || "sem endereço"}{q.client_phone ? " · " + formatPhone(q.client_phone) : ""}</p>
            {itemsOf(q).length > 1 && (
              <p className="small muted">{itemsOf(q).map((item) => (lineQty(item) > 1 ? `${lineQty(item)}× ` : "") + item.name).join(" · ")}</p>
            )}
            <div className="split">
              <span className="price">{money(q.price_cents)}</span>
              <div className="row">
                <button className="btn-ghost" onClick={() => copy(q)}>{copied === q.token ? "Copiado" : "Copiar link"}</button>
                {whatsAppLink(q.client_phone, "x") && <a className="btn" href={whatsAppLink(q.client_phone, shareText(q, linkFor(q)))} target="_blank" rel="noreferrer">WhatsApp</a>}
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => openPaper("orcamento", q, data.profile)}>PDF orçamento</button>
              <button className="btn-ghost" onClick={() => openPaper("recibo", q, data.profile)}>PDF recibo</button>
              {q.status === "sent" && <button className="btn" onClick={() => setStatus(q.token, "approved")}>Cliente aprovou</button>}
              {q.status === "approved" && <button className="btn" onClick={() => setStatus(q.token, "done")}>Marcar feito</button>}
              {q.status === "done" && <button className="btn" onClick={() => setStatus(q.token, "paid")}>Marcar pago</button>}
              {q.status === "rejected" && <button className="btn-ghost" onClick={() => setStatus(q.token, "sent")}>Reabrir</button>}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn-ghost small" onClick={() => setEditing(q.token)}>Editar</button>
              <button className="btn-ghost small" onClick={() => duplicate(q)}>Duplicar</button>
              {["sent", "approved"].includes(q.status) && <button className="btn-ghost small no" onClick={() => cancel(q)}>Cancelar</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function blankLine() {
  return { key: uid(), name: "", qty: "1", price: "" };
}

function formFrom(q) {
  if (!q) {
    return { client_name: "", client_phone: "", address: "", service_name: "", description: "", when: "", deadline: "A combinar", payment: "À vista, PIX", items: [blankLine()] };
  }
  const items = Array.isArray(q.items) && q.items.length ? q.items : (q.service_name ? itemsOf(q) : []);
  return {
    client_name: q.client_name || "",
    client_phone: q.client_phone ? formatPhone(q.client_phone) : "",
    address: q.address || "",
    service_name: q.service_name || "",
    description: q.description || "",
    when: toLocalInput(q.scheduled_at),
    deadline: q.deadline || "A combinar",
    payment: q.payment || "À vista, PIX",
    items: items.length
      ? items.map((i) => ({ key: uid(), name: i.name || "", qty: String(lineQty(i)), price: centsToInput(i.price_cents) }))
      : [blankLine()]
  };
}

function QuoteForm({ services, initial, onSubmit, submitLabel, onCancel, after }) {
  const [form, setForm] = useState(() => formFrom(initial));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const active = services.filter((s) => s.active !== false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function setItem(key, k, v) {
    setForm((f) => ({ ...f, items: f.items.map((item) => item.key === key ? { ...item, [k]: v } : item) }));
  }
  function removeItem(key) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((item) => item.key !== key) : [blankLine()] }));
  }
  const qtyOf = (item) => Math.max(1, Math.round(Number(String(item.qty).replace(",", ".")) || 1));
  const total = form.items.reduce((sum, item) => sum + (parseBRL(item.price) || 0) * qtyOf(item), 0);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const filled = form.items.filter((item) => item.name.trim() || item.price.trim());
    if (!form.client_name.trim()) return setErr("Coloque o nome do cliente.");
    if (!filled.length) return setErr("Coloque pelo menos um serviço com valor.");
    for (const item of filled) {
      if (!item.name.trim()) return setErr("Tem uma linha com valor e sem nome do serviço.");
      if (!Number.isFinite(parseBRL(item.price))) return setErr(`Não entendi o valor de "${item.name}". Use, por exemplo, 180 ou 1.200,50.`);
    }
    if (total <= 0) return setErr("O total está zerado. Confere os valores.");
    const phone = form.client_phone.trim();
    const normalized = normalizePhone(phone);
    if (phone && !normalized) return setErr("Telefone do cliente com DDD, por exemplo (85) 99999-0000.");
    const items = filled.map((item) => ({ name: item.name.trim(), qty: qtyOf(item), price_cents: parseBRL(item.price) }));
    const payload = {
      client_name: form.client_name.trim(),
      client_phone: normalized,
      address: form.address.trim(),
      service_name: form.service_name.trim() || (items.length === 1 ? items[0].name : `${items[0].name} e mais ${items.length - 1}`),
      description: form.description.trim(),
      deadline: form.deadline.trim() || "A combinar",
      payment: form.payment.trim() || "À vista, PIX",
      items,
      price_cents: total,
      scheduled_at: fromLocalInput(form.when)
    };
    setBusy(true);
    const res = (await onSubmit(payload)) || {};
    setBusy(false);
    if (res.error) setErr(res.error);
  }

  return (
    <form className="card" onSubmit={submit}>
      <label>Cliente</label>
      <input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} required />
      <label>Telefone do cliente (WhatsApp)</label>
      <input value={form.client_phone} inputMode="tel" autoComplete="tel" onChange={(e) => set("client_phone", e.target.value)} onBlur={(e) => set("client_phone", formatPhone(e.target.value))} placeholder="(85) 99999-0000" />
      <label>Endereço</label>
      <input value={form.address} onChange={(e) => set("address", e.target.value)} />
      <label>Objeto</label>
      <input value={form.service_name} onChange={(e) => set("service_name", e.target.value)} placeholder="Split 12.000 BTU da sala" />
      <label>Linhas do orçamento</label>
      {active.length > 0 && (
        <select value="" onChange={(e) => {
          const service = active.find((s) => s.id === e.target.value);
          if (!service) return;
          setForm((f) => ({ ...f, items: [...f.items.filter((item) => item.name || item.price), { key: uid(), name: service.name, qty: "1", price: centsToInput(service.price_cents) }] }));
        }}>
          <option value="">Adicionar um serviço recorrente</option>
          {active.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price_cents)}</option>)}
        </select>
      )}
      {form.items.map((item) => (
        <div className="line" key={item.key}>
          <input placeholder="Serviço" value={item.name} onChange={(e) => setItem(item.key, "name", e.target.value)} />
          <input className="qty" aria-label="Quantidade" inputMode="numeric" value={item.qty} onChange={(e) => setItem(item.key, "qty", e.target.value)} />
          <input className="val" placeholder="Valor (R$)" aria-label="Valor unitário" inputMode="decimal" value={item.price} onChange={(e) => setItem(item.key, "price", e.target.value)} />
          <button type="button" className="btn-ghost x" aria-label="Tirar linha" onClick={() => removeItem(item.key)}>×</button>
        </div>
      ))}
      <p className="small muted">Quantidade × valor unitário.</p>
      <button className="btn-ghost" type="button" onClick={() => set("items", [...form.items, blankLine()])}>Mais uma linha</button>
      <p className="price">Total {money(total)}</p>
      <label>Prazo</label>
      <input value={form.deadline} onChange={(e) => set("deadline", e.target.value)} placeholder="No dia" />
      <label>Pagamento</label>
      <input value={form.payment} onChange={(e) => set("payment", e.target.value)} />
      <label>Data da visita</label>
      <input type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} />
      <label>Observação</label>
      <textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Salvando" : submitLabel}</button>
        {onCancel && <button className="btn-ghost" type="button" onClick={onCancel}>Voltar</button>}
      </div>
      {after}
    </form>
  );
}

function Novo({ data, initial, addQuote, onDone }) {
  const [result, setResult] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const wa = result ? whatsAppLink(result.quote.client_phone, shareText(result.quote, result.link)) : "";
  return (
    <QuoteForm
      key={formKey}
      services={data.services}
      initial={initial}
      submitLabel="Gerar link"
      onSubmit={async (payload) => {
        const res = await addQuote(payload);
        if (!res.error) { setResult(res); setCopied(false); onDone?.(); }
        return res;
      }}
      after={result && (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="small">Link do cliente:<br /><a href={result.link}>{result.link}</a></p>
          <div className="row">
            {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">Mandar no WhatsApp</a>}
            <button className="btn-ghost" type="button" onClick={async () => { try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { window.prompt("Copie o link:", result.link); } }}>{copied ? "Copiado" : "Copiar link"}</button>
            <button className="btn-ghost" type="button" onClick={() => { setResult(null); setFormKey((k) => k + 1); }}>Novo orçamento</button>
          </div>
        </div>
      )}
    />
  );
}

function ServiceForm({ initial, onSubmit, onCancel, label }) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial ? centsToInput(initial.price_cents) : "");
  const [description, setDescription] = useState(initial?.description || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr("");
    const cents = parseBRL(price);
    if (!name.trim()) return setErr("Coloque o nome do serviço.");
    if (!Number.isFinite(cents) || cents <= 0) return setErr("Preço inválido. Use, por exemplo, 180 ou 1.200,50.");
    setBusy(true);
    const res = (await onSubmit({ name: name.trim(), description: description.trim(), price_cents: cents })) || {};
    setBusy(false);
    if (res.error) return setErr(res.error);
    if (!initial) { setName(""); setPrice(""); setDescription(""); }
  }
  return (
    <form className="card" style={{ marginTop: 12 }} onSubmit={submit}>
      <label>{label}</label>
      <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Preço (R$)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required style={{ marginTop: 8 }} />
      <textarea placeholder="Incluso" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 8 }} />
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Salvando" : "Salvar serviço"}</button>
        {onCancel && <button className="btn-ghost" type="button" onClick={onCancel}>Voltar</button>}
      </div>
    </form>
  );
}

function Servicos({ data, addService, updateService }) {
  const [editing, setEditing] = useState("");
  const [err, setErr] = useState("");
  const active = data.services.filter((s) => s.active !== false);
  const archived = data.services.filter((s) => s.active === false);
  async function toggle(s, value) {
    setErr("");
    const res = await updateService(s.id, { active: value });
    if (res.error) setErr(res.error);
  }
  function row(s) {
    if (editing === s.id) {
      return (
        <ServiceForm key={s.id} initial={s} label="Editar serviço" onCancel={() => setEditing("")}
          onSubmit={async (patch) => { const res = await updateService(s.id, patch); if (!res.error) setEditing(""); return res; }} />
      );
    }
    return (
      <article key={s.id} className="item">
        <div className="split">
          <div><b>{s.name}</b><span className="small muted">{s.description}</span></div>
          <span className="price">{money(s.price_cents)}</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn-ghost small" onClick={() => setEditing(s.id)}>Editar</button>
          {s.active !== false
            ? <button className="btn-ghost small" onClick={() => toggle(s, false)}>Arquivar</button>
            : <button className="btn-ghost small" onClick={() => toggle(s, true)}>Reativar</button>}
        </div>
      </article>
    );
  }
  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="list">
        {active.length === 0 && <p className="muted">Nenhum serviço ainda. Cadastre os que você faz sempre, com o preço.</p>}
        {active.map(row)}
      </div>
      <ServiceForm label="Novo serviço" onSubmit={addService} />
      {archived.length > 0 && (
        <>
          <p className="kicker" style={{ marginTop: 20 }}>Arquivados</p>
          <div className="list">{archived.map(row)}</div>
        </>
      )}
    </div>
  );
}

function Ajustes({ data, saveProfile, live, onOut }) {
  const [profile, setProfile] = useState({ ...data.profile, phone: formatPhone(data.profile.phone) });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  return (
    <form className="card" onSubmit={async (e) => { e.preventDefault(); setSaving(true); await saveProfile(profile); setSaving(false); }}>
      <label>Nome no papel</label>
      <input value={profile.business_name || ""} onChange={(e) => set("business_name", e.target.value)} />
      <label>Responsável</label>
      <input value={profile.owner_name || ""} onChange={(e) => set("owner_name", e.target.value)} />
      <label>CNPJ</label>
      <input value={profile.cnpj || ""} inputMode="numeric" onChange={(e) => set("cnpj", e.target.value)} />
      <label>Endereço da empresa</label>
      <input value={profile.address_line || ""} onChange={(e) => set("address_line", e.target.value)} />
      <label>Cidade</label>
      <input value={profile.city || ""} onChange={(e) => set("city", e.target.value)} />
      <label>Telefone (WhatsApp)</label>
      <input value={profile.phone || ""} inputMode="tel" onChange={(e) => set("phone", e.target.value)} onBlur={(e) => set("phone", formatPhone(e.target.value))} placeholder="(85) 99999-0000" />
      <label>E-mail</label>
      <input value={profile.email || ""} type="email" inputMode="email" onChange={(e) => set("email", e.target.value)} />
      <label>Chave PIX</label>
      <input value={profile.pix_key || ""} onChange={(e) => set("pix_key", e.target.value)} />
      <label>Logo</label>
      <input type="file" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setMsg("");
        const reader = new FileReader();
        reader.onload = async () => {
          const small = await shrinkLogo(reader.result);
          if (!small) return setMsg("Não consegui ler essa imagem. Tenta um JPG ou PNG.");
          set("logo_data", small);
        };
        reader.readAsDataURL(file);
      }} />
      {msg && <p className="error">{msg}</p>}
      {profile.logo_data && (
        <div className="row" style={{ alignItems: "center", marginTop: 8 }}>
          <img src={profile.logo_data} alt="Logo" style={{ height: 64 }} />
          <button className="btn-ghost small" type="button" onClick={() => set("logo_data", "")}>Tirar logo</button>
        </div>
      )}
      <button className="btn" style={{ marginTop: 14 }} type="submit" disabled={saving}>{saving ? "Salvando" : "Salvar"}</button>
      <p className="small muted">{live ? "Tudo aqui fica salvo na sua conta, inclusive a logo (reduzida). A logo aparece no topo do PDF e no link do cliente." : "Sem Supabase: os dados ficam neste navegador. O link do cliente funciona em outro celular porque o orçamento vai dentro do próprio link."}</p>
      <p className="small muted">O PDF deixa o campo de assinatura em branco. Assine à mão ou digitalmente.</p>
      {live && <button className="btn-ghost" type="button" onClick={onOut}>Sair</button>}
    </form>
  );
}
