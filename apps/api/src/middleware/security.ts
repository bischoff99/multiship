import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { cfg } from '../env.js';

// Security headers middleware
export function securityHeadersMiddleware(app: FastifyInstance) {
  app.addHook('onSend', async (request, reply, payload) => {
    // Basic security headers
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove X-Powered-By header
    reply.removeHeader('X-Powered-By');

    return payload;
  });
}

// HTTPS enforcement middleware
export function httpsEnforcementMiddleware(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const proto = request.headers['x-forwarded-proto'];
    const isHttps = request.protocol === 'https' ||
                   (proto && typeof proto === 'string' && proto.includes('https'));

    if (!isHttps && process.env.NODE_ENV === 'production') {
      return reply.code(403).send({
        error: 'HTTPS Required',
        message: 'This service requires HTTPS in production',
        code: 'HTTPS_REQUIRED'
      });
    }
  });
}

// Enhanced authentication middleware with token validation
export function enhancedAuthMiddleware(token: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing authorization header',
        code: 'UNAUTHORIZED'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid authorization header format',
        code: 'UNAUTHORIZED'
      });
    }

    const providedToken = authHeader.substring(7);

    if (!cfg.SecurityUtils.isValidApiToken(providedToken)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid authorization token format',
        code: 'UNAUTHORIZED'
      });
    }

    if (providedToken !== token) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid authorization token',
        code: 'UNAUTHORIZED'
      });
    }

    // Add user context for rate limiting
    (request as any).userId = 'api-user';
    (request as any).tokenHash = cfg.SecurityUtils.hashForLogging(providedToken);
  };
}

// CORS middleware
export function corsMiddleware(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const origin = request.headers.origin;

    // Set CORS headers
    reply.header('Access-Control-Allow-Origin', origin || '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID');
    reply.header('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      reply.code(200).send();
      return;
    }
  });
}

// Request logging middleware
export function requestLoggingMiddleware(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    const correlationId = request.headers['x-correlation-id'] as string ||
                        `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    (request as any).correlationId = correlationId;

    app.log.info({
      msg: 'Incoming request',
      correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      tokenHash: (request as any).tokenHash || 'no-auth'
    });
  });

  app.addHook('onResponse', async (request, reply) => {
    const correlationId = (request as any).correlationId;

    app.log.info({
      msg: 'Request completed',
      correlationId,
      statusCode: reply.statusCode,
      responseTime: Date.now() - ((request as any).startTime || Date.now())
    });
  });
}

// Security middleware registration function
export function registerSecurityMiddleware(app: FastifyInstance, apiToken: string) {
  // Register all security middleware
  app.register(securityHeadersMiddleware);
  app.register(httpsEnforcementMiddleware);
  app.register(corsMiddleware);
  app.register(requestLoggingMiddleware);

  app.log.info('Security middleware registered successfully');
}