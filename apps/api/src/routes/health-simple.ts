import type { FastifyInstance } from 'fastify';

export default async function healthSimple(app: FastifyInstance) {
  // Simple health route
  app.get('/health', async () => {
    return { status: 'ok' };
  });
}