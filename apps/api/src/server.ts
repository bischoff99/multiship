import Fastify from 'fastify';
import { cfg } from './env.js';
import { registerSecurityMiddleware } from './middleware/security.js';
import health from './routes/health.js';
import shipments from './routes/shipments.js';
import webhooks from './routes/webhooks.js';
import metrics from './routes/metrics.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } },
  // Basic configuration
  ignoreTrailingSlash: true,
  maxParamLength: 100,
  bodyLimit: 1048576, // 1MB
});

// Register Swagger/OpenAPI documentation
app.register(import('@fastify/swagger'), {
  openapi: {
    info: {
      title: 'Multiship API',
      description: 'Provider-agnostic shipping API with EasyPost, Shippo, and Veeqo adapters',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer'
        }
      }
    }
  }
});

app.register(import('@fastify/swagger-ui'), {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  },
  staticCSP: true,
  transformSpecificationClone: true
});

// Register routes
app.register(health);
app.register(shipments, { token: cfg.token });
app.register(webhooks, { epSecret: cfg.epSecret });
app.register(metrics);

// Register security middleware
registerSecurityMiddleware(app, cfg.token);

// Start server
app.listen({ port: cfg.port, host: '0.0.0.0' })
  .then(addr => app.log.info(`API server listening on ${addr}`))
  .catch(err => { 
    app.log.error(err); 
    process.exit(1); 
  });