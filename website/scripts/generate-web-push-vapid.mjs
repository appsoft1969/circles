import { generateKeyPairSync } from "node:crypto";

function base64UrlToBuffer(value) {
  const normalized = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function bufferToBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicKeyBytes = Buffer.concat([
  Buffer.from([0x04]),
  base64UrlToBuffer(publicJwk.x),
  base64UrlToBuffer(publicJwk.y),
]);

console.log("# Add these to the local production env. Do not commit private keys.");
console.log(`WEB_PUSH_PUBLIC_KEY=${bufferToBase64Url(publicKeyBytes)}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${privateJwk.d}`);
console.log("WEB_PUSH_SUBJECT=mailto:admin@useincircle.app");
