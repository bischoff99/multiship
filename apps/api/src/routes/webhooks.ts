import { prisma } from '@pkg/db';
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

function verifyEasyPost(req: any, secret: string): boolean {
  const sig = req.headers['x-hmac-signature'];
  if (!secret || !sig) return false;
  const payload = req.rawBody ?? JSON.stringify(req.body);
  const h = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return String(sig).endsWith(h);
}

export default async function webhooks(app: FastifyInstance, opts: any) {
  app.addHook('onRequest', async (req) => {
    (req as any).rawBody = '';
  });
  app.addContentTypeParser('*', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, body);
    }
  });

  app.post('/webhooks/easypost', async (req, res) => {
    if (!verifyEasyPost(req, opts.epSecret)) {
      res.code(401).send({ error: 'bad signature' });
      return;
    }
    const event = (req.body as any)?.result;
    if (event?.object === 'Tracker') {
      const code = event.tracking_code;
      const status = event.status;
      await prisma.shipment.updateMany({ where: { trackingCode: code }, data: { status } });
    }
    res.send({ ok: true });
  });

  app.post('/webhooks/shippo', async (req, res) => {
    const evt = req.body as any;
    if (evt?.event === 'track_updated') {
      const code = evt?.data?.tracking_number;
      const status = evt?.data?.tracking_status?.status;
      await prisma.shipment.updateMany({ where: { trackingCode: code }, data: { status } });
    }
    res.send({ ok: true });
  });
}
