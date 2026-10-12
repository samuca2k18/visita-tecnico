// PIX "copia e cola" (BR Code estático, padrão EMV do Banco Central), sem biblioteca.

function field(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, "0") + v;
}

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), 4 dígitos hexa maiúsculos.
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Sem acento e só caracteres que todo banco aceita.
function ascii(s, max) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,\-]/g, " ").replace(/\s+/g, " ").trim()
    .slice(0, max).trim();
}

function cpfOk(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjOk(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { const w = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

// Deixa a chave no formato que o PIX espera. Devolve "" se não for uma chave válida.
export function normalizePixKey(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return raw.toLowerCase().slice(0, 77);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return raw.toLowerCase();
  const d = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return /^55\d{10,11}$/.test(d) ? "+" + d : "";
  if (d.length === 14 && cnpjOk(d)) return d;
  if (d.length === 11 && cpfOk(d)) return d;
  // Celular com DDD: (85) 99999-0000 ou 55 85 99999-0000.
  if (d.length === 10 || d.length === 11) return "+55" + d;
  if (/^55\d{10,11}$/.test(d)) return "+" + d;
  return "";
}

export function pixPayload({ key, name, city, amountCents, txid = "***" }) {
  const k = normalizePixKey(key);
  if (!k) return "";
  const cents = Math.round(Number(amountCents) || 0);
  const merchant = field("00", "br.gov.bcb.pix") + field("01", k);
  const tx = ascii(txid, 25).replace(/[^A-Za-z0-9]/g, "") || "***";
  let p =
    field("00", "01") +
    field("26", merchant) +
    field("52", "0000") +
    field("53", "986") +
    (cents > 0 ? field("54", (cents / 100).toFixed(2)) : "") +
    field("58", "BR") +
    field("59", ascii(name, 25) || "RECEBEDOR") +
    field("60", ascii(city, 15) || "BRASIL") +
    field("62", field("05", tx)) +
    "6304";
  return p + crc16(p);
}

// Lê o payload em campos {id: valor}; usado no teste.
export function parseEmv(str) {
  const out = {};
  let i = 0;
  while (i < str.length) {
    const id = str.slice(i, i + 2);
    const len = Number(str.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isFinite(len)) throw new Error("EMV inválido em " + i);
    out[id] = str.slice(i + 4, i + 4 + len);
    if (out[id].length !== len) throw new Error("EMV cortado em " + id);
    i += 4 + len;
  }
  return out;
}
