export type StoredAccessCode = {
  salt: string;
  hash: string;
  iterations: number;
};

export type SessionPayload = {
  sub: "owner";
  exp: number;
};

export const MAX_CLOUDFLARE_PBKDF2_ITERATIONS = 100_000;
const PBKDF2_ITERATIONS = MAX_CLOUDFLARE_PBKDF2_ITERATIONS;
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  return base64ToBytes(padded);
}

async function deriveAccessCode(
  code: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(code),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as ArrayBuffer,
      iterations
    },
    key,
    256
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function hashAccessCode(code: string): Promise<StoredAccessCode> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveAccessCode(code, salt, PBKDF2_ITERATIONS);
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PBKDF2_ITERATIONS
  };
}

export async function verifyAccessCode(
  code: string,
  stored: StoredAccessCode
): Promise<boolean> {
  if (stored.iterations > MAX_CLOUDFLARE_PBKDF2_ITERATIONS) {
    return false;
  }
  const hash = await deriveAccessCode(
    code,
    base64ToBytes(stored.salt),
    stored.iterations
  );
  return constantTimeEqual(hash, base64ToBytes(stored.hash));
}

export async function signSession(
  payload: SessionPayload,
  secret: string
): Promise<string> {
  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload))
  );
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload)
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<SessionPayload | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature) as unknown as ArrayBuffer,
      encoder.encode(encodedPayload)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload))
    ) as Partial<SessionPayload>;
    if (
      payload.sub !== "owner" ||
      typeof payload.exp !== "number" ||
      payload.exp <= nowSeconds
    ) {
      return null;
    }

    return { sub: "owner", exp: payload.exp };
  } catch {
    return null;
  }
}
