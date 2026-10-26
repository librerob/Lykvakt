import { readFileSync } from "node:fs";
import { createCipheriv, scryptSync, pbkdf2Sync } from "node:crypto";
export const sourcePassword = "synthetic source password å";
export const fixture = (name) =>
  readFileSync(new URL("../fixtures/" + name, import.meta.url), "utf8");
const encrypt = (key, iv, text) => {
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  return {
    bytes: Buffer.concat([cipher.update(text, "utf8"), cipher.final()]),
    tag: cipher.getAuthTag(),
  };
};
// Independent Node/OpenSSL implementations; fixed values are SYNTHETIC test data only.
export function aegisFixture() {
  const db = JSON.parse(fixture("aegis.json")).db;
  const salt = Buffer.alloc(32, 1),
    raw = Buffer.alloc(32, 2),
    iv = Buffer.alloc(12, 3),
    slotIV = Buffer.alloc(12, 4);
  const key = scryptSync(sourcePassword, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 65 * 1024 * 1024,
  });
  try {
    const slot = encrypt(key, slotIV, raw),
      payload = encrypt(raw, iv, JSON.stringify(db));
    return {
      version: 1,
      header: {
        slots: [
          {
            type: 1,
            uuid: "33333333-3333-4333-8333-333333333333",
            n: 32768,
            r: 8,
            p: 1,
            salt: salt.toString("hex"),
            key: slot.bytes.toString("hex"),
            key_params: {
              nonce: slotIV.toString("hex"),
              tag: slot.tag.toString("hex"),
            },
          },
        ],
        params: { nonce: iv.toString("hex"), tag: payload.tag.toString("hex") },
      },
      db: payload.bytes.toString("base64"),
    };
  } finally {
    raw.fill(0);
    key.fill(0);
  }
}
export function twofasFixture() {
  const salt = Buffer.alloc(256, 5),
    key = pbkdf2Sync(sourcePassword, salt, 10000, 32, "sha256");
  const encode = (text, byte) => {
    const iv = Buffer.alloc(12, byte),
      value = encrypt(key, iv, text);
    return [
      Buffer.concat([value.bytes, value.tag]).toString("base64"),
      salt.toString("base64"),
      iv.toString("base64"),
    ].join(":");
  };
  try {
    return {
      schemaVersion: 4,
      services: [],
      servicesEncrypted: encode(
        JSON.stringify(JSON.parse(fixture("2fas.json")).services),
        6,
      ),
      reference: encode(
        "tRViSsLKzd86Hprh4ceC2OP7xazn4rrt4xhfEUbOjxLX8Rc3mkISXE0lWbmnWfggogbBJhtYgpK6fMl1D6mtsy92R3HkdGfwuXbzLebqVFJsR7IZ2w58t938iymwG4824igYy1wi6n2WDpO1Q1P69zwJGs2F5a1qP4MyIiDSD7NCV2OvidXQCBnDlGfmz0f1BQySRkkt4ryiJeCjD2o4QsveJ9uDBUn8ELyOrESv5R5DMDkD4iAF8TXU7KyoJujd",
        7,
      ),
    };
  } finally {
    key.fill(0);
  }
}
