import 'dotenv/config';
export const cfg = {
  port: Number(process.env.API_PORT ?? 4000),
  token: process.env.API_TOKEN ?? 'dev-token',
  baseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:4000',
  epSecret: process.env.EASYPOST_WEBHOOK_SECRET ?? ''
};
