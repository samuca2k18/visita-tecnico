"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase, uid } from "../lib/shared";
import { Icon } from "../lib/icons";

export const MAX_PHOTOS = 8;
const BUCKET = "fotos-visita";

// Reduz para no máximo 1600px e JPEG ~1,2 MB. Só aceita imagem.
export function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Isso não é uma imagem."));
    if (file.size > 25 * 1024 * 1024) return reject(new Error("Imagem grande demais (máx. 25 MB)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      let max = 1600;
      for (let tries = 0; tries < 5; tries++) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", tries ? 0.72 : 0.8));
        if (blob && blob.size <= 1200 * 1024) return resolve(blob);
        max = Math.round(max * 0.75);
      }
      reject(new Error("Não consegui reduzir essa foto."));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui ler essa imagem.")); };
    img.src = url;
  });
}

export function PhotoBox({ quote, userId, photos, onChange }) {
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const inputs = { antes: useRef(null), depois: useRef(null) };
  const mine = photos.filter((p) => p.quote_token === quote.token);
  const paths = mine.map((p) => p.path).join("|");

  useEffect(() => {
    if (!mine.length) { setUrls({}); return; }
    getSupabase().storage.from(BUCKET).createSignedUrls(mine.map((p) => p.path), 3600).then(({ data }) => {
      const map = {};
      (data || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
    });
  }, [paths]);

  async function add(kind, files) {
    setErr("");
    const list = Array.from(files || []);
    if (!list.length) return;
    const room = MAX_PHOTOS - mine.length;
    if (room <= 0) return setErr(`Já tem ${MAX_PHOTOS} fotos neste orçamento. Apague uma pra colocar outra.`);
    if (list.length > room) setErr(`Só cabem mais ${room}. Enviei as primeiras.`);
    const sb = getSupabase();
    setBusy(kind);
    for (const file of list.slice(0, room)) {
      try {
        const blob = await compressPhoto(file);
        const path = `${userId}/${quote.token}/${uid()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) throw new Error(up.error.message);
        const ins = await sb.from("quote_photos").insert({ quote_token: quote.token, kind, path, user_id: userId });
        if (ins.error) {
          await sb.storage.from(BUCKET).remove([path]);
          throw new Error(/limite/.test(ins.error.message) ? `Limite de ${MAX_PHOTOS} fotos.` : ins.error.message);
        }
      } catch (e) {
        setErr("Não enviei uma foto: " + e.message);
        break;
      }
    }
    setBusy("");
    if (inputs[kind].current) inputs[kind].current.value = "";
    await onChange();
  }

  async function remove(p) {
    if (!window.confirm("Apagar esta foto? O cliente também deixa de ver.")) return;
    const sb = getSupabase();
    const del = await sb.from("quote_photos").delete().eq("id", p.id);
    if (del.error) return setErr("Não apaguei: " + del.error.message);
    await sb.storage.from(BUCKET).remove([p.path]);
    await onChange();
  }

  return (
    <div className="photo-box">
      <p className="small muted" style={{ margin: "0 0 8px" }}>Até {MAX_PHOTOS} fotos. O cliente vê no link do orçamento.</p>
      {["antes", "depois"].map((kind) => {
        const list = mine.filter((p) => p.kind === kind);
        return (
          <div key={kind}>
            <h3 className="photos-h">{kind === "antes" ? "Antes" : "Depois"} <span className="muted">({list.length})</span></h3>
            {list.length > 0 && (
              <div className="photos">
                {list.map((p) => (
                  <div className="ph" key={p.id}>
                    {urls[p.path] ? <img src={urls[p.path]} alt={"Foto " + kind} loading="lazy" /> : null}
                    <button type="button" aria-label="Apagar foto" onClick={() => remove(p)}><Icon name="trash" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="photo-add">
        {["antes", "depois"].map((kind) => (
          <label key={kind} className="btn-soft small" aria-disabled={!!busy || mine.length >= MAX_PHOTOS}>
            <Icon name="camera" />{busy === kind ? "Enviando…" : kind === "antes" ? "Foto do antes" : "Foto do depois"}
            <input ref={inputs[kind]} type="file" accept="image/*" multiple disabled={!!busy || mine.length >= MAX_PHOTOS} onChange={(e) => add(kind, e.target.files)} />
          </label>
        ))}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
