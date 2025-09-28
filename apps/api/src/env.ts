import 'dotenv/config';
import { randomBytes } from 'crypto';
export const cfg = {
  port: Number(process.env.API_PORT ?? 4000),
  token: process.env.API_TOKEN ?? 'dev-token',
  baseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:4000',
  epSecret: process.env.EASYPOST_WEBHOOK_SECRET ?? '',

  // Security utilities
  SecurityUtils: {
    /**
     * Generate a cryptographically secure random token
     */
    generateSecureToken(length: number = 64): string {
      return randomBytes(length).toString('hex');
    },

    /**
     * Validate API token format
     */
    isValidApiToken(token: string): boolean {
      return typeof token === 'string' && token.length >= 32;
    },

    /**
     * Hash sensitive data for logging (without exposing actual values)
     */
    hashForLogging(input: string): string {
      return require('crypto').createHash('sha256').update(input).digest('hex').substring(0, 8);
    },

    /**
     * Check if running in production environment
     */
    isProduction(): boolean {
      return process.env.NODE_ENV === 'production';
    },

    /**
     * Check if HTTPS is required
     */
    isHttpsRequired(): boolean {
      return process.env.HTTPS_ENABLED?.toLowerCase() === 'true';
    }
  }
};
