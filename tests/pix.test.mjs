import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, pixPayload, parseEmv, normalizePixKey } from "../lib/pix.js";

test("CRC16 bate com o exemplo do manual do BR Code (Banco Central)", () => {
  const ex = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(ex), "1D3D");
  assert.equal(crc16("123456789"), "29B1");
});

test("payload completo com valor e CRC válido", () => {
  const p = pixPayload({ key: "(85) 99999-0000", name: "Ar do Samuca Refrigeração", city: "Fortaleza", amountCents: 120050, txid: "VT1A2B3C" });
  const f = parseEmv(p);
  assert.equal(f["00"], "01");
  assert.deepEqual(parseEmv(f["26"]), { "00": "br.gov.bcb.pix", "01": "+5585999990000" });
  assert.equal(f["52"], "0000");
  assert.equal(f["53"], "986");
  assert.equal(f["54"], "1200.50");
  assert.equal(f["58"], "BR");
  assert.equal(f["59"], "Ar do Samuca Refrigeracao");
  assert.equal(f["60"], "Fortaleza");
  assert.deepEqual(parseEmv(f["62"]), { "05": "VT1A2B3C" });
  assert.equal(f["63"], crc16(p.slice(0, -4)));
  assert.ok(p.endsWith("6304" + f["63"]));
});

test("chaves: e-mail, CPF, CNPJ, aleatória e inválidas", () => {
  assert.equal(normalizePixKey("Fulano@Email.com"), "fulano@email.com");
  assert.equal(normalizePixKey("529.982.247-25"), "52998224725");
  assert.equal(normalizePixKey("11.222.333/0001-81"), "11222333000181");
  assert.equal(normalizePixKey("123E4567-E12B-12D1-A456-426655440000"), "123e4567-e12b-12d1-a456-426655440000");
  assert.equal(normalizePixKey("+55 85 98888-7777"), "+5585988887777");
  assert.equal(normalizePixKey("chave-de-exemplo"), "");
  assert.equal(normalizePixKey(""), "");
  assert.equal(pixPayload({ key: "abc", name: "x", city: "y", amountCents: 100 }), "");
});

test("nome e cidade cortados no limite (25 e 15)", () => {
  const f = parseEmv(pixPayload({ key: "a@b.co", name: "Nome muito comprido de empresa de ar condicionado", city: "São José do Ribamar", amountCents: 1 }));
  assert.ok(f["59"].length <= 25);
  assert.ok(f["60"].length <= 15);
  assert.equal(f["54"], "0.01");
});
