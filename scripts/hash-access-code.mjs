const code = process.argv[2];
if (!code) {
  console.error("用法: node scripts/hash-access-code.mjs <访问码>");
  process.exit(1);
}

const encoder = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  "raw",
  encoder.encode(code),
  "PBKDF2",
  false,
  ["deriveBits"]
);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
  key,
  256
);
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
console.log(
  JSON.stringify({
    salt: b64(salt),
    hash: b64(new Uint8Array(bits)),
    iterations: 100_000
  })
);
