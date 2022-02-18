// @ts-check
const fs = require('fs');
const {resolve} = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const {default: Shopify, ApiVersion} = require('@shopify/shopify-api');

const applyAuthMiddleware = require('./server/middleware/auth');

const USE_ONLINE_TOKENS = true;
const PORT = parseInt(process.env.PORT || '8081', 10);
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD;

require('dotenv/config');

Shopify.Context.initialize({
  API_KEY: process.env.VITE_SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(','),
  HOST_NAME: process.env.HOST.replace(/https:\/\//, ''),
  API_VERSION: ApiVersion.Unstable,
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

// Storing the currently active shops in memory will force them to re-login when your server restarts. You should
// persist this object in your app.
const ACTIVE_SHOPIFY_SHOPS = {};
Shopify.Webhooks.Registry.addHandler('APP_UNINSTALLED', {
  path: '/webhooks',
  webhookHandler: async (topic, shop, body) =>
    delete ACTIVE_SHOPIFY_SHOPS[shop],
});

async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
) {
  const indexProd = isProd
    ? fs.readFileSync(resolve('dist/client/index.html'), 'utf-8')
    : '';

  const app = express();
  app.set('top-level-oauth-cookie', 'shopify_top_level_oauth');
  app.set('active-shopify-shops', ACTIVE_SHOPIFY_SHOPS);
  app.set('use-online-tokens', USE_ONLINE_TOKENS);

  app.use(cookieParser(Shopify.Context.API_SECRET_KEY));

  applyAuthMiddleware(app);

  app.post('/graphql', async (req, res) => {
    await Shopify.Utils.graphqlProxy(req, res);
  });

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite;
  if (!isProd) {
    vite = await require('vite').createServer({
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        port: PORT,
        hmr: {
          protocol: 'ws',
          host: 'localhost',
          port: 64999,
          clientPort: 64999,
        },
        middlewareMode: 'html',
      },
    });
    // use vite's connect instance as middleware
    app.use(vite.middlewares);
  } else {
    app.use(require('compression')());
    app.use(
      require('serve-static')(resolve('dist/client'), {
        index: false,
      }),
    );
  }

  return {app, vite};
}

if (!isTest) {
  createServer().then(({app}) => app.listen(PORT));
}

// for test use
exports.createServer = createServer;
