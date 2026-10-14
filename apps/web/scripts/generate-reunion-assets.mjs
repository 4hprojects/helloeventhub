import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import QRCode from 'qrcode';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../public/events/mb-wa-reunion-2026');
const background = `data:image/png;base64,${fs.readFileSync(path.join(out, 'artwork-background.png')).toString('base64')}`;
const eventUrl = 'https://helloeventhub.online/events/mb-wa-reunion-2026';
const mapsUrl = 'https://maps.app.goo.gl/6NLwRQT4iLkmXosD6';
const qrOptions = {
  width: 360,
  margin: 4,
  errorCorrectionLevel: 'H',
  color: { dark: '#123f2a', light: '#fffdf5' },
};
const [eventQr, mapsQr] = await Promise.all([
  QRCode.toDataURL(eventUrl, qrOptions),
  QRCode.toDataURL(mapsUrl, qrOptions),
]);

const branches = [
  ['Albina', 'Baon Tinay / Magastino'],
  ['Magdalena', 'Palag Mat-an'],
  ['Mary', 'Francisco Marino'],
  ['Toribio', 'Virginia Villanueva'],
  ['Ganzon', 'Pilar Licdan'],
  ['Onofre', 'Belen Wagsi'],
  ['Mistihil', 'Zenaida Calado'],
  ['Denio', 'Pacita Guzman'],
];
const branchHtml = branches
  .map(
    ([name, associated], index) =>
      `<div class="branch"><b>${index + 1}. ${name}</b><span>${associated}</span></div>`,
  )
  .join('');
const baseCss = `*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#173b2a}.canvas{position:relative;overflow:hidden;background:#fff9e8}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,249,232,.2),rgba(255,249,232,.52) 42%,rgba(18,63,42,.12))}.content{position:relative;z-index:1}h1,h2,p{margin:0}.panel{background:rgba(255,253,245,.94);border:2px solid rgba(214,166,46,.72);border-radius:22px;box-shadow:0 8px 24px rgba(18,63,42,.12)}`;
const poster = `<!doctype html><style>${baseCss}
  .canvas{width:1080px;height:1350px;padding:34px}.content{height:100%;display:grid;grid-template-rows:auto auto auto auto 1fr;gap:18px}
  header{text-align:center;padding:24px 32px}.edition{font:800 34px Georgia;color:#8a5a0a}.title{font:800 52px/1.02 Georgia;color:#123f2a;text-transform:uppercase;margin-top:6px}.tagline{font:italic 700 29px Georgia;color:#22633f;margin-top:13px}
  .branches{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;padding:18px}.branch{background:#fff9e8;border-radius:14px;padding:11px 16px;display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:19px}.branch span{font:italic 16px Georgia;color:#4b5d50;text-align:right}
  .details{padding:18px 24px;display:grid;grid-template-columns:1fr 1fr;gap:12px 22px;text-align:center}.details b{font:800 24px Georgia}.details span{display:block;font-size:17px;margin-top:5px}.venue{grid-column:1/-1;border-top:1px solid #d6a62e;padding-top:12px}
  .invitation{position:absolute;top:760px;left:95px;width:890px;text-align:center;font:22px/1.45 Georgia;color:#31523d}
  .qrs{display:grid;grid-template-columns:1fr 1fr;gap:18px;transform:translateY(200px)}.qr{padding:16px;display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center}.qr img{width:150px;height:150px}.qr h2{font:800 20px/1.1 Arial;text-transform:uppercase}.qr p{font-size:13px;line-height:1.25;word-break:break-all;margin-top:9px}.deadline{margin-top:10px;padding:8px;background:#fff3c9;border-radius:8px;font-weight:700;font-size:14px}
  footer{align-self:end;text-align:center;color:#fffdf5;background:rgba(18,63,42,.92);border-radius:18px;padding:13px 22px;font:italic 21px/1.25 Georgia}
  </style><div class="canvas"><img class="bg" src="${background}"><div class="shade"></div><div class="content"><header class="panel"><div class="edition">1ST</div><h1 class="title">Menay Bugtong - Wakat Alsem<br>Clan Reunion</h1><p class="tagline">One Family, Many Faces, New Connections</p></header><section class="branches panel">${branchHtml}</section><section class="details panel"><div><b>Saturday, October 24, 2026</b></div><div><b>9:00 AM–3:00 PM</b><span>Onsite registration begins 8:00 AM</span></div><div class="venue"><b>Veterans Building</b><span>Puguis, La Trinidad, Benguet</span></div></section><p class="invitation">You’re invited to our first clan reunion! Come meet relatives, discover family connections, and celebrate our shared heritage.</p><section class="qrs"><div class="qr panel"><img src="${eventQr}"><div><h2>Scan to Register &amp; View Event Details</h2><p>${eventUrl}</p><div class="deadline">Online preregistration deadline: October 20, 2026</div></div></div><div class="qr panel"><img src="${mapsQr}"><div><h2>Scan for Directions</h2><p>${mapsUrl}</p></div></div></section><footer>Let’s come together, meet our relatives, and create new memories for generations to come!</footer></div></div>`;

const social = `<!doctype html><style>${baseCss}
  .canvas{width:1200px;height:630px}.bg{filter:saturate(.85)}.shade{background:linear-gradient(90deg,rgba(18,63,42,.96) 0%,rgba(18,63,42,.86) 55%,rgba(18,63,42,.2) 100%)}.content{height:100%;width:760px;padding:58px;color:#fffdf5;display:flex;flex-direction:column;justify-content:center}.eyebrow{color:#f3d77d;font-weight:800;font-size:24px;text-transform:uppercase;letter-spacing:.08em}.title{font:800 55px/1.04 Georgia;color:#fffdf5;margin-top:14px}.tagline{font:italic 700 27px Georgia;color:#f3d77d;margin-top:18px}.facts{font-size:23px;line-height:1.45;margin-top:30px}.brand{font-weight:700;margin-top:30px;font-size:20px}
  </style><div class="canvas"><img class="bg" src="${background}"><div class="shade"></div><div class="content"><p class="eyebrow">1st Clan Reunion</p><h1 class="title">Menay Bugtong - Wakat Alsem Clan Reunion</h1><p class="tagline">One Family, Many Faces, New Connections</p><p class="facts"><b>Saturday, October 24, 2026 · 9:00 AM–3:00 PM</b><br>Veterans Building, Puguis, La Trinidad, Benguet</p><p class="brand">HelloEventHub</p></div></div>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/snap/bin/chromium',
  headless: true,
});
try {
  for (const [html, filename, width, height] of [
    [poster, 'invitation-poster.png', 1080, 1350],
    [social, 'social-preview.png', 1200, 630],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.locator('.canvas').screenshot({ path: path.join(out, filename) });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Generated reunion poster and social preview in ${out}`);
