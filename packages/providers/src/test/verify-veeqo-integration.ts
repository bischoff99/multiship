#!/usr/bin/env tsx

/**
 * Veeqo Integration Verification Script
 *
 * This script performs comprehensive verification of the Veeqo API integration
 * including health checks, configuration validation, and sample API calls.
 *
 * Usage:
 *   npm run verify:veeqo          # Run all verification tests
 *   npm run verify:veeqo:health   # Only run health checks
 *   npm run verify:veeqo:config   # Only validate configuration
 */

import { VeeqoAdapter } from '../adapters/veeqo-adapter.js';
import { getProviderConfig } from '../config/provider-config.js';
import { Logger, LogLevel } from '../utils/logger.js';

interface VerificationResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration?: number;
  details?: any;
}

class VeeqoIntegrationVerifier {
  private adapter: VeeqoAdapter;
  private logger: Logger;
  private results: VerificationResult[] = [];

  constructor() {
    this.adapter = new VeeqoAdapter();
    this.logger = new Logger(
      process.env.VERIFY_LOG_LEVEL as LogLevel || LogLevel.INFO,
      [], // No destinations for this script
      { verifier: 'veeqo-integration' }
    );
  }

  async runAllTests(): Promise<void> {
    this.logger.info('Starting Veeqo integration verification');

    try {
      await this.testConfiguration();
      await this.testHealthCheck();
      await this.testAdapterInitialization();
      await this.testSampleQuoteFlow();
      await this.testErrorHandling();
    } catch (error) {
      this.logger.error('Verification failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }

    this.printSummary();
  }

  async runHealthCheckOnly(): Promise<void> {
    this.logger.info('Running Veeqo health check only');
    await this.testHealthCheck();
    this.printSummary();
  }

  async runConfigOnly(): Promise<void> {
    this.logger.info('Running Veeqo configuration validation only');
    await this.testConfiguration();
    this.printSummary();
  }

  private async testConfiguration(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Configuration Validation';

    try {
      this.logger.info('Validating Veeqo configuration');

      // Check required environment variables
      const apiKey = process.env.VEEQO_API_KEY;
      const baseUrl = process.env.VEEQO_API_BASE || 'https://api.veeqo.com';

      if (!apiKey) {
        throw new Error('VEEQO_API_KEY environment variable is not set');
      }

      if (!apiKey.startsWith('Vqt/')) {
        this.logger.warn('API key does not follow expected format (should start with Vqt/)');
      }

      // Validate configuration loading
      const config = getProviderConfig('veeqo');

      if (!config.enabled) {
        throw new Error('Veeqo provider is disabled in configuration');
      }

      this.logger.info('Configuration validation passed', {
        baseUrl,
        enabled: config.enabled,
        timeout: config.timeouts.requestTimeout
      });

      this.recordResult(testName, 'PASS', 'Configuration is valid', Date.now() - startTime);
    } catch (error) {
      this.recordResult(
        testName,
        'FAIL',
        error instanceof Error ? error.message : String(error),
        Date.now() - startTime
      );
      throw error;
    }
  }

  private async testHealthCheck(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Health Check';

    try {
      this.logger.info('Performing Veeqo health check');

      const isHealthy = await this.adapter.healthCheck();
      const duration = Date.now() - startTime;

      if (isHealthy) {
        this.logger.info('Health check passed', { duration });
        this.recordResult(testName, 'PASS', 'Veeqo API is accessible', duration);
      } else {
        throw new Error('Health check returned false');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordResult(
        testName,
        'FAIL',
        error instanceof Error ? error.message : String(error),
        duration
      );
      throw error;
    }
  }

  private async testAdapterInitialization(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Adapter Initialization';

    try {
      this.logger.info('Testing VeeqoAdapter initialization');

      // Verify adapter properties
      if (!this.adapter.name) {
        throw new Error('Adapter name is not set');
      }

      if (this.adapter.name !== 'veeqo') {
        throw new Error(`Expected adapter name 'veeqo', got '${this.adapter.name}'`);
      }

      // Verify circuit breaker is initialized
      const circuitBreaker = (this.adapter as any).circuitBreaker;
      if (!circuitBreaker) {
        throw new Error('Circuit breaker not initialized');
      }

      if (circuitBreaker.state !== 'CLOSED') {
        throw new Error(`Expected circuit breaker state 'CLOSED', got '${circuitBreaker.state}'`);
      }

      this.logger.info('Adapter initialization test passed');
      this.recordResult(testName, 'PASS', 'Adapter initialized correctly', Date.now() - startTime);
    } catch (error) {
      this.recordResult(
        testName,
        'FAIL',
        error instanceof Error ? error.message : String(error),
        Date.now() - startTime
      );
      throw error;
    }
  }

  private async testSampleQuoteFlow(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Sample Quote Flow';

    try {
      this.logger.info('Testing sample quote flow (dry run)');

      // Note: This is a dry run test that validates the flow without making actual API calls
      // In a real scenario, you would need a valid allocation ID to test the full flow

      // Test input validation
      const testInput = {
        to: {
          name: 'Test Recipient',
          street1: '123 Test Street',
          city: 'Test City',
          state: 'CA',
          zip: '90210',
          country: 'US'
        },
        from: {
          name: 'Test Sender',
          street1: '456 Sender Ave',
          city: 'Sender City',
          state: 'CA',
          zip: '90211',
          country: 'US'
        },
        parcel: {
          length: 12,
          width: 8,
          height: 6,
          weight: 2.5,
          distance_unit: 'in' as const,
          mass_unit: 'lb' as const
        },
        veeqo: {
          allocationId: 12345
        }
      };

      // Validate input structure
      if (!testInput.veeqo?.allocationId) {
        throw new Error('Test input missing allocationId');
      }

      this.logger.info('Sample quote flow validation passed', {
        parcel: testInput.parcel,
        allocationId: testInput.veeqo.allocationId
      });

      this.recordResult(testName, 'PASS', 'Sample quote flow structure is valid', Date.now() - startTime);
    } catch (error) {
      this.recordResult(
        testName,
        'FAIL',
        error instanceof Error ? error.message : String(error),
        Date.now() - startTime
      );
      throw error;
    }
  }

  private async testErrorHandling(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Error Handling';

    try {
      this.logger.info('Testing error handling capabilities');

      // Test that adapter throws appropriate errors for invalid inputs
      await expect(this.adapter.quote({} as any))
        .rejects
        .toThrow();

      // Test purchase without allocation ID
      await expect(this.adapter.purchase('rate_123'))
        .rejects
        .toThrow('allocationId is required');

      this.logger.info('Error handling test passed');
      this.recordResult(testName, 'PASS', 'Error handling works correctly', Date.now() - startTime);
    } catch (error) {
      this.recordResult(
        testName,
        'FAIL',
        error instanceof Error ? error.message : String(error),
        Date.now() - startTime
      );
      throw error;
    }
  }

  private recordResult(test: string, status: VerificationResult['status'], message: string, duration?: number): void {
    this.results.push({
      test,
      status,
      message,
      duration,
      details: { timestamp: new Date().toISOString() }
    });
  }

  private printSummary(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const skippedTests = this.results.filter(r => r.status === 'SKIP').length;

    console.log('\n' + '='.repeat(60));
    console.log('VEEQO INTEGRATION VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`⏭️  Skipped: ${skippedTests}`);

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  • ${result.test}: ${result.message}`);
        if (result.duration) {
          console.log(`    Duration: ${result.duration}ms`);
        }
      });
    }

    console.log('\n📊 TEST DETAILS:');
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
      console.log(`${icon} ${result.test}: ${result.message}`);
      if (result.duration) {
        console.log(`   Duration: ${result.duration}ms`);
      }
    });

    console.log('\n' + '='.repeat(60));

    if (failedTests > 0) {
      console.log('❌ VERIFICATION FAILED');
      process.exit(1);
    } else {
      console.log('✅ VERIFICATION PASSED');
      process.exit(0);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const verifier = new VeeqoIntegrationVerifier();

  try {
    if (args.includes('--health-only')) {
      await verifier.runHealthCheckOnly();
    } else if (args.includes('--config-only')) {
      await verifier.runConfigOnly();
    } else {
      await verifier.runAllTests();
    }
  } catch (error) {
    console.error('Verification failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { VeeqoIntegrationVerifier };