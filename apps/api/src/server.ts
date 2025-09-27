import Fastify from 'fastify';
import { cfg } from './env.js';
import health from './routes/health.js';
import shipments from './routes/shipments.js';
import webhooks from './routes/webhooks.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } }
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

app.register(health);
app.register(shipments, { token: cfg.token });
app.register(webhooks, { epSecret: cfg.epSecret });

app.listen({ port: cfg.port, host: '0.0.0.0' })
  .then(addr => app.log.info(`api ${addr}`))
  .catch(err => { app.log.error(err); process.exit(1); });
