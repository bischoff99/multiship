import { FastifyRequest, FastifyReply } from 'fastify';

// Generate UUID for correlation ID
function generateCorrelationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Request logging middleware configuration
export interface LoggingMiddlewareConfig {
  enabled: boolean;
  logRequestBody: boolean;
  logResponseBody: boolean;
  maxBodyLogSize: number;
  excludePaths: string[];
  includeHeaders: boolean;
  sensitiveHeaders: string[];
}

// Default configuration
const defaultConfig: LoggingMiddlewareConfig = {
  enabled: true,
  logRequestBody: false,
  logResponseBody: false,
  maxBodyLogSize: 1024, // 1KB
  excludePaths: ['/health', '/docs', '/favicon.ico'],
  includeHeaders: true,
  sensitiveHeaders: ['authorization', 'x-api-key', 'cookie', 'set-cookie']
};

// Request logging middleware
export function requestLoggingMiddleware(
  globalConfig: Partial<LoggingMiddlewareConfig> = {}
) {
  const config = { ...defaultConfig, ...globalConfig };

  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.enabled) {
      return;
    }

    // Skip excluded paths
    if (config.excludePaths.some(path => request.url.includes(path))) {
      return;
    }

    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const ip = request.ip || 'unknown';

    // Log request start
    console.log(`[${new Date().toISOString()}] [INFO] Request started`, {
      correlationId,
      method,
      url,
      userAgent,
      ip,
      headers: config.includeHeaders ? sanitizeHeaders(request.headers, config.sensitiveHeaders) : undefined,
      bodySize: config.logRequestBody && request.body ? JSON.stringify(request.body).length : 0
    });

    // Store correlation ID in request
    (request as any).correlationId = correlationId;
    (request as any).startTime = startTime;

    // Hook into response to log completion
    reply.raw.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const statusCode = reply.statusCode;

      // Determine log level based on status code
      let level: string;
      let message: string;

      if (statusCode >= 500) {
        level = 'ERROR';
        message = 'Request failed with server error';
      } else if (statusCode >= 400) {
        level = 'WARN';
        message = 'Request failed with client error';
      } else {
        level = 'INFO';
        message = 'Request completed successfully';
      }

      // Log response
      console.log(`[${new Date().toISOString()}] [${level}] ${message}`, {
        correlationId,
        statusCode,
        responseTime,
        method,
        url
      });
    });
  };
}

// Helper function to sanitize sensitive headers
function sanitizeHeaders(headers: Record<string, string | string[] | undefined>, sensitiveHeaders: string[]): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.includes(lowerKey)) {
      sanitized[key] = '***REDACTED***';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Correlation ID middleware to add correlation ID to response headers
export function correlationIdMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = (request as any).correlationId || generateCorrelationId();

    // Add correlation ID to response headers
    reply.header('x-correlation-id', correlationId);

    // Store in request for downstream use
    (request as any).correlationId = correlationId;
  };
}

// Health check endpoint for logging middleware
export async function loggingHealthCheck(): Promise<{ enabled: boolean; status: string }> {
  return {
    enabled: true,
    status: 'healthy'
  };
}