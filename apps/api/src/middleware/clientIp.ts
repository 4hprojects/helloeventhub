import { BlockList, isIP } from 'node:net';
import type { RequestHandler } from 'express';

// Cloudflare's published edge ranges (https://www.cloudflare.com/ips/). Review if Cloudflare announces changes.
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];

const cloudflare = new BlockList();
for (const c of CLOUDFLARE_V4) {
  const [net, bits] = c.split('/');
  cloudflare.addSubnet(net!, Number(bits), 'ipv4');
}
for (const c of CLOUDFLARE_V6) {
  const [net, bits] = c.split('/');
  cloudflare.addSubnet(net!, Number(bits), 'ipv6');
}

/** Strip the IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4). */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

export function isCloudflareIp(ip: string): boolean {
  const n = normalizeIp(ip);
  const v = isIP(n);
  return v === 4 ? cloudflare.check(n, 'ipv4') : v === 6 ? cloudflare.check(n, 'ipv6') : false;
}

/**
 * Sets req.clientIp: the real visitor address used for rate limits and Turnstile.
 * With behindCloudflare, CF-Connecting-IP is trusted ONLY when the hop that reached us (req.ip, as
 * reported by the trusted reverse proxy) is a Cloudflare edge address — so a client that bypasses
 * Cloudflare and talks to the origin directly cannot spoof its IP to dodge rate limits.
 */
export function clientIp(behindCloudflare: boolean): RequestHandler {
  return (req, _res, next) => {
    const hop = normalizeIp(req.ip ?? '');
    const cf = req.get('cf-connecting-ip')?.trim();
    req.clientIp = behindCloudflare && cf && isIP(cf) && isCloudflareIp(hop) ? normalizeIp(cf) : hop || 'unknown';
    next();
  };
}
