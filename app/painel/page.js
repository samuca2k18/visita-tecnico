"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, supabaseReady, money, when, uid, STATUS } from "../../lib/shared";
import { loadDemo, saveDemo, encodeQuote } from "../../lib/demo";
import { openPaper } from "../../lib/papers";

export default function Painel() {
  const live = supabaseReady();
  const [tab, setTab] = useState("hoje");
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState("");

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

  async function refresh() {
    const sb = getSupabase();
    const user = session.user;
    const [{ data: profile }, { data: services }, { data: quotes }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("services").select("*").eq("user_id", user.id).order("created_at"),
      sb.from("quotes").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    ]);
    setData({
      profile: profile || { business_name: "Meu serviço", phone: "", pix_key: "", city: "Fortaleza" },
      services: services || [],
      quotes: quotes || []
    });
  }

  function persist(next) {
    setData(next);
    if (!live) saveDemo(next);
  }

  function readCreds(e) {
    const form = e?.currentTarget?.form || e?.currentTarget;
    const em = (form?.elements?.email?.value ?? email).trim();
    const pw = form?.elements?.password?.value ?? password;
    return { em, pw };
  }

  function traduz(msg) {
    if (/email rate limit/i.test(msg)) return "O Supabase limitou o envio de e-mail. Espera cerca de uma hora, ou entra com a conta que já existe.";
    if (/anonymous sign-ins are disabled/i.test(msg)) return "Preencha o e-mail e a senha.";
    if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar.";
    if (/already registered/i.test(msg)) return "Esse e-mail já tem conta. Use Entrar.";
    return msg;
  }

  async function signIn(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const { em, pw } = readCreds(e);
    if (!em || !pw) return setError("Preencha o e-mail e a senha.");
    const sb = getSupabase();
    const { error: err } = await sb.auth.signInWithPassword({ email: em, password: pw });
    if (err) setError(traduz(err.message));
  }

  async function signUp(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const { em, pw } = readCreds(e);
    if (!em || !pw) return setError("Preencha o e-mail e a senha para criar a conta.");
    if (pw.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    const sb = getSupabase();
    const { data, error: err } = await sb.functions.invoke("criar-conta", { body: { email: em, password: pw } });
    if (err) return setError("Não consegui criar a conta agora. Tenta de novo em alguns minutos.");
    if (data?.error) return setError(data.error);
    const { error: inErr } = await sb.auth.signInWithPassword({ email: em, password: pw });
    if (inErr) setError(traduz(inErr.message));
  }

  async function saveProfile(profile) {
    persist({ ...data, profile });
    if (!live) return;
    const { logo_data, cnpj, address_line, email, owner_name, ...base } = profile;
    await getSupabase().from("profiles").upsert({ id: session.user.id, ...base });
  }

  async function addService(service) {
    if (live) {
      await getSupabase().from("services").insert({ ...service, user_id: session.user.id });
      return refresh();
    }
    persist({ ...data, services: [...data.services, { ...service, id: uid(), active: true }] });
  }

  async function addQuote(quote) {
    const token = uid();
    const row = { ...quote, token, status: "sent" };
    if (live) {
      await getSupabase().from("quotes").insert({ ...row, user_id: session.user.id });
      await refresh();
      return token;
    }
    persist({ ...data, quotes: [row, ...data.quotes] });
    return encodeQuote(row, data.profile);
  }

  async function setStatus(token, status) {
    if (live) {
      await getSupabase().from("quotes").update({ status, updated_at: new Date().toISOString() }).eq("token", token);
      return refresh();
    }
    persist({ ...data, quotes: data.quotes.map((q) => q.token === token ? { ...q, status } : q) });
  }

  function linkFor(q) {
    const token = live ? q.token : encodeQuote(q, data.profile);
    return `${window.location.origin}/o/${token}`;
  }

  if (!session) {
    return (
      <main className="shell">
        <div className="top"><Link className="brand" href="/">Visi<span>ta</span></Link></div>
        <form className="card" onSubmit={signIn}>
          <div className="kicker">Técnico</div>
          <h2>Entrar</h2>
          <label>E-mail</label>
          <input name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label>Senha</label>
          <input name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
          {error && <p className="error">{error}</p>}
          {info && <p className="muted">{info}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" type="submit">Entrar</button>
            <button className="btn-ghost" type="button" onClick={signUp}>Criar conta</button>
          </div>
        </form>
      </main>
    );
  }

  if (!data) return <main className="shell"><p className="muted">Carregando.</p></main>;

  return (
    <main className="shell">
      <div className="top">
        <Link className="brand" href="/">Visi<span>ta</span></Link>
        <span className="muted small">{live ? "Supabase" : "Ensaio neste aparelho"}</span>
      </div>
      <div className="tabs">
        {["hoje", "novo", "servicos", "ajustes"].map((id) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {id === "hoje" ? "Hoje" : id === "novo" ? "Novo" : id === "servicos" ? "Serviços" : "Ajustes"}
          </button>
        ))}
      </div>
      {tab === "hoje" && <Hoje data={data} setStatus={setStatus} linkFor={linkFor} copied={copied} setCopied={setCopied} />}
      {tab === "novo" && <Novo data={data} addQuote={addQuote} linkForLive={live} />}
      {tab === "servicos" && <Servicos data={data} addService={addService} />}
      {tab === "ajustes" && <Ajustes data={data} saveProfile={saveProfile} live={live} onOut={() => live ? getSupabase().auth.signOut() : null} />}
    </main>
  );
}

function Hoje({ data, setStatus, linkFor, copied, setCopied }) {
  async function copy(q) {
    const url = linkFor(q);
    await navigator.clipboard.writeText(url);
    setCopied(q.token);
  }
  return (
    <div className="list">
      {data.quotes.length === 0 && <p className="muted">Nenhum orçamento ainda. Aba Novo.</p>}
      {data.quotes.map((q) => (
        <article key={q.token} className="item">
          <div className="split">
            <b>{q.client_name} · {q.service_name}</b>
            <span className="pill">{STATUS[q.status]}</span>
          </div>
          <p className="small muted">{when(q.scheduled_at)} · {q.address || "sem endereço"}</p>
          {Array.isArray(q.items) && q.items.length > 1 && <p className="small muted">{q.items.map((item) => (Number(item.qty) > 1 ? `${item.qty}× ` : "") + item.name).join(" · ")}</p>}
          <div className="split">
            <span className="price">{money(q.price_cents)}</span>
            <button className="btn-ghost" onClick={() => copy(q)}>{copied === q.token ? "Copiado" : "Copiar link"}</button>
          </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => openPaper("orcamento", q, data.profile)}>PDF orçamento</button>
              <button className="btn-ghost" onClick={() => openPaper("recibo", q, data.profile)}>PDF recibo</button>
              {q.status === "approved" && <button className="btn" onClick={() => setStatus(q.token, "done")}>Marcar feito</button>}
              {q.status === "done" && <button className="btn" onClick={() => setStatus(q.token, "paid")}>Marcar pago</button>}
            </div>
        </article>
      ))}
    </div>
  );
}

function blankLine(services) {
  const first = services[0];
  return {
    key: uid(),
    pick: first?.name || "__outro",
    name: first?.name || "",
    price: first ? String(first.price_cents / 100) : "",
    qty: "1"
  };
}

function Novo({ data, addQuote }) {
  const [form, setForm] = useState({ client_name: "", client_phone: "", address: "", note: "", when: "" });
  const [lines, setLines] = useState([blankLine(data.services)]);
  const [link, setLink] = useState("");
  function set(k, v) { setForm({ ...form, [k]: v }); }
  function setLine(key, patch) {
    setLines(lines.map((line) => line.key === key ? { ...line, ...patch } : line));
  }
  function pickService(key, value) {
    if (value === "__outro") return setLine(key, { pick: value, name: "" });
    const service = data.services.find((item) => item.name === value);
    setLine(key, { pick: value, name: value, price: service ? String(service.price_cents / 100) : "" });
  }
  const total = lines.reduce((sum, line) => {
    const qty = Math.max(1, Number(line.qty) || 1);
    const price = Number(String(line.price).replace(",", ".")) || 0;
    return sum + Math.round(price * 100) * qty;
  }, 0);
  async function submit(e) {
    e.preventDefault();
    const items = lines.map((line) => ({
      name: (line.pick === "__outro" ? line.name : line.pick).trim(),
      qty: Math.max(1, Number(line.qty) || 1),
      price_cents: Math.round(Number(String(line.price).replace(",", ".")) * 100) || 0
    })).filter((item) => item.name);
    if (!items.length) return;
    const service_name = items.length === 1 ? items[0].name : `${items[0].name} e mais ${items.length - 1}`;
    const token = await addQuote({
      client_name: form.client_name,
      client_phone: form.client_phone,
      address: form.address,
      service_name,
      description: form.note,
      price_cents: items.reduce((sum, item) => sum + item.price_cents * item.qty, 0),
      items,
      scheduled_at: form.when ? new Date(form.when).toISOString() : null
    });
    setLink(`${window.location.origin}/o/${token}`);
  }
  return (
    <form className="card" onSubmit={submit}>
      <label>Cliente</label>
      <input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} required />
      <label>Telefone</label>
      <input value={form.client_phone} onChange={(e) => set("client_phone", e.target.value)} />
      <label>Endereço</label>
      <input value={form.address} onChange={(e) => set("address", e.target.value)} />
      {lines.map((line, index) => (
        <div key={line.key} style={{ marginTop: 12 }}>
          <label>Serviço {lines.length > 1 ? index + 1 : ""}</label>
          <select value={line.pick} onChange={(e) => pickService(line.key, e.target.value)}>
            {data.services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
            <option value="__outro">Outro</option>
          </select>
          {line.pick === "__outro" && <input placeholder="Nome do serviço" value={line.name} onChange={(e) => setLine(line.key, { name: e.target.value })} required style={{ marginTop: 8 }} />}
          <div className="row" style={{ marginTop: 8 }}>
            <input type="number" min="1" value={line.qty} onChange={(e) => setLine(line.key, { qty: e.target.value })} aria-label="Quantidade" style={{ width: 80 }} />
            <input value={line.price} onChange={(e) => setLine(line.key, { price: e.target.value })} required placeholder="Preço (R$)" aria-label="Preço" />
          </div>
          {lines.length > 1 && <button className="btn-ghost" type="button" onClick={() => setLines(lines.filter((item) => item.key !== line.key))} style={{ marginTop: 8 }}>Tirar</button>}
        </div>
      ))}
      <button className="btn-ghost" type="button" onClick={() => setLines([...lines, blankLine(data.services)])} style={{ marginTop: 12 }}>Adicionar serviço</button>
      <p className="price" style={{ marginTop: 12 }}>Total {money(total)}</p>
      <label>Data e hora</label>
      <input type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} />
      <label>Observação</label>
      <textarea value={form.note} onChange={(e) => set("note", e.target.value)} />
      <button className="btn" style={{ marginTop: 14 }} type="submit">Gerar link</button>
      {link && <p>Manda isso no WhatsApp:<br /><a href={link}>{link}</a></p>}
    </form>
  );
}

function Servicos({ data, addService }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div>
      <div className="list">
        {data.services.map((s) => (
          <article key={s.id} className="item split">
            <div><b>{s.name}</b><span className="small muted">{s.description}</span></div>
            <span className="price">{money(s.price_cents)}</span>
          </article>
        ))}
      </div>
      <form className="card" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); addService({ name, description, price_cents: Math.round(Number(price.replace(",", ".")) * 100) }); setName(""); setPrice(""); setDescription(""); }}>
        <label>Novo serviço</label>
        <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Preço" value={price} onChange={(e) => setPrice(e.target.value)} required style={{ marginTop: 8 }} />
        <textarea placeholder="Incluso" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 8 }} />
        <button className="btn" style={{ marginTop: 10 }} type="submit">Salvar serviço</button>
      </form>
    </div>
  );
}

function Ajustes({ data, saveProfile, live, onOut }) {
  const [profile, setProfile] = useState(data.profile);
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); saveProfile(profile); }}>
      <label>Nome no papel</label>
      <input value={profile.business_name || ""} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} />
      <label>Responsável</label>
      <input value={profile.owner_name || ""} onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })} />
      <label>CNPJ</label>
      <input value={profile.cnpj || ""} onChange={(e) => setProfile({ ...profile, cnpj: e.target.value })} />
      <label>Endereço da empresa</label>
      <input value={profile.address_line || ""} onChange={(e) => setProfile({ ...profile, address_line: e.target.value })} />
      <label>Cidade</label>
      <input value={profile.city || ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
      <label>Telefone</label>
      <input value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
      <label>E-mail</label>
      <input value={profile.email || ""} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
      <label>Chave PIX</label>
      <input value={profile.pix_key || ""} onChange={(e) => setProfile({ ...profile, pix_key: e.target.value })} />
      <label>Logo</label>
      <input type="file" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setProfile({ ...profile, logo_data: reader.result });
        reader.readAsDataURL(file);
      }} />
      {profile.logo_data && <img src={profile.logo_data} alt="Logo" style={{ height: 64, marginTop: 8 }} />}
      <button className="btn" style={{ marginTop: 14 }} type="submit">Salvar</button>
      <p className="small muted">A logo fica só neste aparelho. No PDF entra no topo, se existir. A assinatura não vai pronta: o papel deixa o campo e recomenda assinar digitalmente.</p>
      <p className="small muted">{live ? "Conta ligada ao Supabase." : "Sem chave do Supabase: os dados ficam neste navegador. O link do cliente funciona em outro celular porque o orçamento vai dentro do próprio link."}</p>
      {live && <button className="btn-ghost" type="button" onClick={onOut}>Sair</button>}
    </form>
  );
}
