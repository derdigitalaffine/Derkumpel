import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web/public');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const expected = {
  'derkumpel-logo-v2.png': [900, 330],
  'derkumpel-icon-192-v2.png': [192, 192],
  'derkumpel-icon-512-v2.png': [512, 512],
  'derkumpel-icon-maskable-512-v2.png': [512, 512],
  'apple-touch-icon-v2.png': [180, 180],
  'favicon-32-v2.png': [32, 32],
  'favicon-64-v2.png': [64, 64],
};

for (const [name, [width, height]] of Object.entries(expected)) {
  const filename = path.join(root, name);
  const bytes = fs.readFileSync(filename);
  assert.ok(bytes.length > 128, `Empty/truncated PNG: ${name}`);
  assert.ok(bytes.subarray(0, 8).equals(signature), `Invalid PNG signature: ${name}`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `Missing PNG header: ${name}`);
  assert.equal(bytes.readUInt32BE(16), width, `Wrong width for ${name}`);
  assert.equal(bytes.readUInt32BE(20), height, `Wrong height for ${name}`);
  assert.equal(bytes.toString('ascii', bytes.length - 8, bytes.length - 4), 'IEND', `Missing PNG trailer: ${name}`);
  console.log(`OK ${name}: ${width}x${height}, ${bytes.length} bytes`);
}
