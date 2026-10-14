import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (name: string) => path.resolve(here, `../public/events/mb-wa-reunion-2026/${name}`);

function crop(image: PNG, x: number, y: number, width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const source = ((y + row) * image.width + x + column) * 4;
      const target = (row * width + column) * 4;
      data.set(image.data.subarray(source, source + 4), target);
    }
  }
  return { data, width, height };
}

describe('reunion sharing assets', () => {
  it('has the approved poster and social-preview dimensions', () => {
    const poster = PNG.sync.read(fs.readFileSync(asset('invitation-poster.png')));
    const social = PNG.sync.read(fs.readFileSync(asset('social-preview.png')));
    expect([poster.width, poster.height]).toEqual([1080, 1350]);
    expect([social.width, social.height]).toEqual([1200, 630]);
  });

  it('decodes both poster QR codes to the exact approved URLs', () => {
    const poster = PNG.sync.read(fs.readFileSync(asset('invitation-poster.png')));
    const eventQr = crop(poster, 45, 965, 175, 175);
    const mapsQr = crop(poster, 565, 965, 175, 175);
    expect(jsQR(eventQr.data, eventQr.width, eventQr.height)?.data).toBe(
      'https://helloeventhub.online/events/mb-wa-reunion-2026',
    );
    expect(jsQR(mapsQr.data, mapsQr.width, mapsQr.height)?.data).toBe(
      'https://maps.app.goo.gl/6NLwRQT4iLkmXosD6',
    );
  });
});
