import {
  base64,
  canonical,
  importVaultKey,
  open,
  random,
  unbase64,
  type Envelope,
  type PasskeySlot,
} from "./crypto";

interface PRFResults {
  prf?: { enabled?: boolean; results?: { first: ArrayBuffer } };
}
type Extensions = AuthenticationExtensionsClientInputs & {
  prf: { eval: { first: Uint8Array<ArrayBuffer> } };
};
function extensions(salt: Uint8Array<ArrayBuffer>): Extensions {
  return { prf: { eval: { first: salt } } };
}
function challengeString(bytes: Uint8Array): string {
  return base64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function validateClient(
  credential: PublicKeyCredential,
  challenge: Uint8Array,
  type: "webauthn.create" | "webauthn.get",
): void {
  const data = JSON.parse(
    new TextDecoder().decode(credential.response.clientDataJSON),
  ) as Record<string, unknown>;
  if (
    data.type !== type ||
    data.origin !== location.origin ||
    data.challenge !== challengeString(challenge) ||
    data.crossOrigin === true
  )
    throw new Error("Unexpected passkey ceremony.");
  if (type === "webauthn.get") {
    const auth = new Uint8Array(
      (credential.response as AuthenticatorAssertionResponse).authenticatorData,
    );
    if (auth.length < 37 || (auth[32]! & 5) !== 5)
      throw new Error("Passkey requires user presence and verification.");
  }
}
function output(credential: PublicKeyCredential): Uint8Array<ArrayBuffer> {
  const bytes = (credential.getClientExtensionResults() as PRFResults).prf
    ?.results?.first;
  if (!bytes || bytes.byteLength !== 32)
    throw new Error(
      "This authenticator did not provide WebAuthn PRF output. Use your master password.",
    );
  return new Uint8Array(bytes);
}
function binding(e: Envelope, slot: PasskeySlot): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    canonical({
      purpose: "otp-vault-prf-wrap-v1",
      origin: location.origin,
      vault: e.id,
      credential: slot.credential,
      id: slot.id,
      salt: slot.salt,
    }),
  );
}
async function wrappingKey(
  prf: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  try {
    const key = await crypto.subtle.importKey("raw", prf, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: new TextEncoder().encode(
          "otp-vault/prf-kek/v1/" + location.origin,
        ),
      },
      key,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    prf.fill(0);
  }
}
async function assertion(slot: PasskeySlot): Promise<PublicKeyCredential> {
  const challenge = random(32);
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        { type: "public-key", id: unbase64(slot.credential, 2048) },
      ],
      userVerification: "required",
      timeout: 60_000,
      extensions: extensions(unbase64(slot.salt, 32)),
    },
  });
  if (!(credential instanceof PublicKeyCredential))
    throw new Error("Passkey operation cancelled.");
  validateClient(credential, challenge, "webauthn.get");
  return credential;
}
export async function enroll(
  e: Envelope,
  rawVaultKey: Uint8Array<ArrayBuffer>,
): Promise<PasskeySlot> {
  if (
    !globalThis.PublicKeyCredential ||
    location.protocol !== "chrome-extension:"
  )
    throw new Error(
      "Passkey enrollment requires the installed Chrome extension in its full window.",
    );
  const challenge = random(32),
    salt = random(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "OTP Vault (development preview)" },
      user: {
        id: random(32),
        name: "local-vault",
        displayName: "Local encrypted vault",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "preferred",
      },
      attestation: "none",
      timeout: 60_000,
      extensions: extensions(salt),
    },
  });
  if (!(credential instanceof PublicKeyCredential))
    throw new Error("Passkey operation cancelled.");
  validateClient(credential, challenge, "webauthn.create");
  const result = credential.getClientExtensionResults() as PRFResults;
  if (!result.prf?.enabled && !result.prf?.results)
    throw new Error(
      "This passkey provider does not support PRF. Your password unlock is unchanged.",
    );
  const slot: PasskeySlot = {
    id: crypto.randomUUID(),
    credential: base64(new Uint8Array(credential.rawId)),
    salt: base64(salt),
    iv: base64(random(12)),
    wrapped: "",
  };
  // Two distinct authentication requests prove a stable PRF output before saving.
  const first = await assertion(slot);
  const key = await wrappingKey(output(first), salt);
  slot.wrapped = base64(
    new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: unbase64(slot.iv, 12),
          additionalData: binding(e, slot),
        },
        key,
        rawVaultKey,
      ),
    ),
  );
  const second = await assertion(slot);
  const restored = await unwrap(e, slot, second);
  try {
    if (restored.length !== 32 || restored.some((b, i) => b !== rawVaultKey[i]))
      throw new Error("Passkey round-trip failed.");
    await open(e, await importVaultKey(restored));
  } finally {
    restored.fill(0);
  }
  return slot;
}
async function unwrap(
  e: Envelope,
  slot: PasskeySlot,
  credential: PublicKeyCredential,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await wrappingKey(output(credential), unbase64(slot.salt, 32));
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unbase64(slot.iv, 12),
        additionalData: binding(e, slot),
      },
      key,
      unbase64(slot.wrapped, 48),
    ),
  );
}
export async function unlockPasskey(
  e: Envelope,
  slot: PasskeySlot,
): Promise<{ key: CryptoKey; data: Awaited<ReturnType<typeof open>> }> {
  const credential = await assertion(slot);
  const raw = await unwrap(e, slot, credential);
  try {
    const key = await importVaultKey(raw);
    return { key, data: await open(e, key) };
  } finally {
    raw.fill(0);
  }
}
