async function deriveKeyBytes(secret: string): Promise<Uint8Array> {
  const encodedSecret = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encodedSecret.buffer as ArrayBuffer
  );
  return new Uint8Array(digest);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encryptSecret(
  plainText: string,
  secret: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = await deriveKeyBytes(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    new TextEncoder().encode(plainText).buffer as ArrayBuffer
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(
  encryptedValue: string,
  secret: string
): Promise<string> {
  const [ivValue, cipherValue] = encryptedValue.split(".");
  if (!ivValue || !cipherValue) {
    throw new Error("加密密钥格式无效");
  }
  const iv = base64ToBytes(ivValue);
  const keyBytes = await deriveKeyBytes(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    base64ToBytes(cipherValue).buffer as ArrayBuffer
  );
  return new TextDecoder().decode(decrypted);
}
