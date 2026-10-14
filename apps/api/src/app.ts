import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import MongoStore from 'connect-mongo';
import express, { type RequestHandler } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import type { AppDeps } from './app-deps.js';
import { HttpError } from './lib/errors.js';
import { ADMIN_SESSION_MAX_AGE_MS, requireAdmin, requireCsrf } from './middleware/auth.js';
import { clientIp } from './middleware/clientIp.js';
import { errorHandler, notFoundHandler, requestId } from './middleware/core.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { extraRoutes } from './routes/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Reject cross-site mutations whose Origin isn't allowlisted (defense in depth alongside CSRF tokens). */
function originGuard(allowed: string[]): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const self = `${req.protocol}://${req.get('host')}`;
    if (origin === self || allowed.includes(origin)) return next();
    next(new HttpError(403, 'origin_not_allowed', 'Cross-site request blocked'));
  };
}

export function createApp(deps: AppDeps) {
  const { config, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  // Cloudflare preserves the visitor scheme in X-Forwarded-Proto. Keep the
  // internal HelloDeploy health probe reachable over HTTP, but canonicalize
  // every public production request to the configured HTTPS origin.
  if (config.isProd) {
    app.use((req, res, next) => {
      if (req.secure || req.path === '/api/v1/health') return next();
      const origin = new URL(config.APP_BASE_URL).origin;
      return res.redirect(308, `${origin}${req.originalUrl.startsWith('/') ? req.originalUrl : `/${req.originalUrl}`}`);
    });
  }

  app.use(requestId);
  app.use(clientIp(config.CLOUDFLARE));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { id: string }).id,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, path: req.url.split('?')[0] }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", 'https://challenges.cloudflare.com'],
          'frame-src': ['https://challenges.cloudflare.com'],
          'connect-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          ...(config.isProd ? {} : { 'upgrade-insecure-requests': null }),
        },
      },
      strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());

  const api = express.Router();
  api.use(express.json({ limit: '64kb' }));
  api.use(originGuard(config.allowedOrigins));
  api.use(
    session({
      name: 'heh.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: MongoStore.create({
        client: mongoose.connection.getClient() as never,
        collectionName: 'sessions',
        ttl: ADMIN_SESSION_MAX_AGE_MS / 1000,
        autoRemove: 'native',
        stringify: false,
      }),
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        maxAge: ADMIN_SESSION_MAX_AGE_MS,
        path: '/api',
      },
    }),
  );
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use('/', publicRoutes(deps));
  api.use('/auth', authRoutes(deps));
  const extra = extraRoutes(deps);
  // Admin auth runs exactly once per request, for every admin router.
  api.use('/admin', requireCsrf, requireAdmin, adminRoutes(deps), ...extra.admin);
  for (const [mount, router] of extra.other) api.use(mount, router);
  api.use(notFoundHandler);
  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);

  // ---------------------------------------------------------- SPA (same origin)
  const webDist = config.WEB_DIST_DIR ?? path.resolve(here, '../../web/dist');
  if (existsSync(path.join(webDist, 'index.html'))) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'public, max-age=300');
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else if (!config.isTest) {
    logger.warn({ webDist }, 'web build not found; serving API only');
  }

  app.use(errorHandler(logger));
  return app;
}
