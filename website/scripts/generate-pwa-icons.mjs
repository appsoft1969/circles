import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(rootDir, "public", "icons");

const colors = {
  green: [17, 150, 90, 255],
  cream: [246, 246, 243, 255],
  blue: [46, 98, 212, 255],
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawRow = y * (width * 4 + 1);
    const pixelRow = y * width * 4;
    raw[rawRow] = 0;
    pixels.copy(raw, rawRow + 1, pixelRow, pixelRow + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(pixels, size, x, y, color) {
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function drawCircle(pixels, size, centerX, centerY, radius, color) {
  const radiusSquared = radius * radius;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(size - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(size - 1, Math.ceil(centerY + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function buildIcon(size, maskable = false) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      setPixel(pixels, size, x, y, colors.green);
    }
  }

  const inset = maskable ? 0.18 : 0;
  const scale = 1 - inset * 2;
  const point = (value) => (inset + value * scale) * size;

  drawCircle(pixels, size, point(0.488), point(0.441), point(0.277), colors.cream);
  drawCircle(pixels, size, point(0.488), point(0.441), point(0.152), colors.green);
  drawCircle(pixels, size, point(0.648), point(0.648), point(0.123), colors.blue);
  drawCircle(pixels, size, point(0.648), point(0.648), point(0.053), colors.cream);
  return pixels;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "icon-192.png"), png(192, 192, buildIcon(192)));
writeFileSync(join(outputDir, "icon-512.png"), png(512, 512, buildIcon(512)));
writeFileSync(join(outputDir, "maskable-512.png"), png(512, 512, buildIcon(512, true)));
