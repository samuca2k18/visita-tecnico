const KEY = "visita-demo-v1";

export const seed = {
  profile: {
    business_name: "Ar do Samuca",
    cnpj: "",
    address_line: "",
    email: "",
    owner_name: "",
    phone: "85999990000",
    pix_key: "85999990000",
    city: "Fortaleza"
  },
  services: [
    { id: "s1", name: "Limpeza de split", description: "Higienização completa, 1 evaporadora.", price_cents: 18000, active: true },
    { id: "s2", name: "Carga de gás", description: "Vazamento conferido antes. Gás à parte se faltar.", price_cents: 25000, active: true },
    { id: "s3", name: "Instalação 12.000 BTU", description: "Até 3 metros de tubulação. Suporte incluso.", price_cents: 45000, active: true }
  ],
  quotes: []
};

export function loadDemo() {
  if (typeof window === "undefined") return structuredClone(seed);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(seed);
    return { ...structuredClone(seed), ...JSON.parse(raw) };
  } catch {
    return structuredClone(seed);
  }
}

const EXTRA = "visita-extra-v1";

export function loadExtra() {
  if (typeof window === "undefined") return { profile: {}, quotes: {} };
  try {
    return JSON.parse(localStorage.getItem(EXTRA) || "") || { profile: {}, quotes: {} };
  } catch {
    return { profile: {}, quotes: {} };
  }
}

export function saveExtra(extra) {
  const copy = {
    profile: extra.profile || {},
    quotes: extra.quotes || {}
  };
  if (copy.profile.logo_data && copy.profile.logo_data.length > 180000) {
    copy.profile = { ...copy.profile, logo_data: "" };
  }
  localStorage.setItem(EXTRA, JSON.stringify(copy));
}

export function shrinkLogo(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const scale = Math.min(size / img.width, size / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

export function encodeQuote(quote, profile) {
  const payload = {
    token: quote.token,
    client_name: quote.client_name,
    address: quote.address,
    service_name: quote.service_name,
    description: quote.description,
    deadline: quote.deadline || "",
    payment: quote.payment || "",
    items: quote.items || [],
    price_cents: quote.price_cents,
    status: quote.status,
    scheduled_at: quote.scheduled_at,
    business_name: profile.business_name,
    cnpj: profile.cnpj || "",
    address_line: profile.address_line || "",
    email: profile.email || "",
    owner_name: profile.owner_name || "",
    city: profile.city || "",
    pix_key: profile.pix_key,
    business_phone: profile.phone
  };
  return "d." + btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeQuote(token) {
  if (!token?.startsWith("d.")) return null;
  try {
    const b64 = token.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(pad))));
  } catch {
    return null;
  }
}
