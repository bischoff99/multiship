import { MockProviderAdapter, CircuitBreakerTestUtils, TestTimeUtils, TestDataFactory, PerformanceTestUtils } from '../test-utils.js';

describe('Circuit Breaker Performance Tests', () => {
  let provider: MockProviderAdapter;

  beforeEach(() => {
    provider = new MockProviderAdapter('test-provider');
    TestTimeUtils.resetTime();
  });

  afterEach(() => {
    TestTimeUtils.resetTime();
  });

  describe('Circuit Breaker State Transitions', () => {
    it('should handle rapid state transitions efficiently', async () => {
      const transitions = 1000;

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        for (let i = 0; i < transitions; i++) {
          // Simulate rapid failures and recoveries
          if (i % 10 < 8) { // 80% failure rate
            provider.setFailureMode('network', true);
            try {
              await provider.quote(TestDataFactory.createShipmentInput());
            } catch (error) {
              // Expected to fail
            }
          } else { // 20% success rate
            provider.setFailureMode('network', false);
            await provider.quote(TestDataFactory.createShipmentInput());
          }
        }
      });

      const avgTransitionTime = duration / transitions;
      console.log(`Circuit breaker transitions: ${duration.toFixed(2)}ms for ${transitions} transitions`);
      console.log(`Average time per transition: ${avgTransitionTime.toFixed(4)}ms`);

      // Should handle rapid transitions efficiently
      expect(avgTransitionTime).toBeLessThan(1); // Less than 1ms per transition
    });

    it('should handle concurrent state access efficiently', async () => {
      const concurrency = 20;
      const operationsPerWorker = 100;

      // Set up provider to fail initially, then succeed
      provider.setFailureMode('network', true);

      const { totalTime } = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          for (let i = 0; i < operationsPerWorker; i++) {
            try {
              await provider.quote(TestDataFactory.createShipmentInput());
            } catch (error) {
              // Expected to fail initially
            }
          }
        },
        concurrency,
        1
      );

      const totalOperations = concurrency * operationsPerWorker;
      const avgTime = totalTime / totalOperations;

      console.log(`Concurrent circuit breaker access: ${totalTime.toFixed(2)}ms for ${totalOperations} operations`);
      console.log(`Average time per operation: ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(5); // Should handle concurrent access efficiently
    });
  });

  describe('Failure Detection Performance', () => {
    it('should detect failures quickly under load', async () => {
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const operations = 1000;

        for (let i = 0; i < operations; i++) {
          provider.setFailureMode('network', true);
          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected to fail
          }
        }
      });

      const avgDetectionTime = duration / 1000;
      console.log(`Failure detection: ${duration.toFixed(2)}ms for 1000 failures`);
      console.log(`Average detection time: ${avgDetectionTime.toFixed(4)}ms`);

      // Should detect failures quickly
      expect(avgDetectionTime).toBeLessThan(2); // Less than 2ms per failure
    });

    it('should handle intermittent failures efficiently', async () => {
      const totalOperations = 10000;
      const failurePattern = [true, false, true, false, false]; // 40% failure rate

      let operationIndex = 0;

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        for (let i = 0; i < totalOperations; i++) {
          const shouldFail = failurePattern[operationIndex % failurePattern.length];
          provider.setFailureMode('network', shouldFail);
          operationIndex++;

          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected for failures
          }
        }
      });

      const avgTime = duration / totalOperations;
      console.log(`Intermittent failures: ${duration.toFixed(2)}ms for ${totalOperations} operations`);
      console.log(`Average time per operation: ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(1); // Should handle intermittent failures efficiently
    });
  });

  describe('Recovery Performance', () => {
    it('should recover from circuit breaker state changes efficiently', async () => {
      // Force circuit breaker to OPEN state
      provider.setFailureMode('network', true);
      for (let i = 0; i < 6; i++) {
        try {
          await provider.quote(TestDataFactory.createShipmentInput());
        } catch (error) {
          // Expected to fail
        }
      }

      // Now test recovery
      provider.setFailureMode('network', false);

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        for (let i = 0; i < 100; i++) {
          await provider.quote(TestDataFactory.createShipmentInput());
        }
      });

      const avgRecoveryTime = duration / 100;
      console.log(`Circuit breaker recovery: ${duration.toFixed(2)}ms for 100 operations`);
      console.log(`Average recovery time: ${avgRecoveryTime.toFixed(4)}ms`);

      // Recovery should be efficient
      expect(avgRecoveryTime).toBeLessThan(5); // Less than 5ms per operation during recovery
    });
  });

  describe('Timing and Threshold Performance', () => {
    it('should handle timing-based state changes efficiently', async () => {
      provider.setFailureMode('network', true);

      // Trigger circuit breaker to OPEN
      for (let i = 0; i < 6; i++) {
        try {
          await provider.quote(TestDataFactory.createShipmentInput());
        } catch (error) {
          // Expected to fail
        }
      }

      const startTime = Date.now();

      // Wait for half-open timeout (simulate with mocked time)
      TestTimeUtils.advanceTime(60001); // Advance past HALF_OPEN timeout
      TestTimeUtils.mockDateNow();

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        try {
          await provider.quote(TestDataFactory.createShipmentInput());
        } catch (error) {
          // May still fail if circuit breaker logic requires successful call
        }
      });

      const totalTime = Date.now() - startTime;
      console.log(`Timing-based transition: ${duration.toFixed(2)}ms`);

      // Should handle timing efficiently
      expect(duration).toBeLessThan(100); // Less than 100ms for timing operations
    });

    it('should handle threshold calculations efficiently', async () => {
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        // Simulate many threshold checks
        for (let i = 0; i < 10000; i++) {
          provider.setFailureMode('network', i % 10 < 7); // 70% failure rate

          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected to fail
          }
        }
      });

      const avgThresholdTime = duration / 10000;
      console.log(`Threshold calculations: ${duration.toFixed(2)}ms for 10000 operations`);
      console.log(`Average threshold time: ${avgThresholdTime.toFixed(4)}ms`);

      expect(avgThresholdTime).toBeLessThan(0.5); // Very fast threshold calculations
    });
  });

  describe('Memory Usage During Circuit Breaker Operations', () => {
    it('should not leak memory during extended circuit breaker operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate extended circuit breaker operations
      for (let round = 0; round < 100; round++) {
        // Cycle through different failure modes
        for (const failureType of ['network', 'timeout', 'rateLimit'] as const) {
          provider.setFailureMode(failureType, true);

          for (let i = 0; i < 10; i++) {
            try {
              await provider.quote(TestDataFactory.createShipmentInput());
            } catch (error) {
              // Expected to fail
            }
          }
        }

        // Recovery phase
        provider.setFailureMode('network', false);
        for (let i = 0; i < 5; i++) {
          await provider.quote(TestDataFactory.createShipmentInput());
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`Circuit breaker memory usage: ${memoryIncreaseMB.toFixed(2)}MB increase`);

      // Memory increase should be minimal
      expect(memoryIncreaseMB).toBeLessThan(10); // Less than 10MB increase
    });
  });

  describe('Circuit Breaker Under Load', () => {
    it('should handle high-frequency operations under circuit breaker protection', async () => {
      // Setup provider with intermittent failures
      const failureRate = 0.3; // 30% failure rate

      const { totalTime: highFreqTotalTime, errors } = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          const shouldFail = Math.random() < failureRate;
          provider.setFailureMode('network', shouldFail);

          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected for failures
          }
        },
        50, // High concurrency
        200 // 10000 total operations
      );

      const avgTime = highFreqTotalTime / 10000;

      console.log(`High-frequency circuit breaker: ${highFreqTotalTime.toFixed(2)}ms for 10000 operations`);
      console.log(`Average time per operation: ${avgTime.toFixed(4)}ms`);
      console.log(`Error rate: ${(errors / 10000 * 100).toFixed(2)}%`);

      // Should handle high frequency efficiently
      expect(avgTime).toBeLessThan(2); // Less than 2ms per operation
    });

    it('should maintain performance during circuit breaker storms', async () => {
      // Simulate a "storm" of failures
      const stormOperations = 5000;

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        provider.setFailureMode('network', true);

        for (let i = 0; i < stormOperations; i++) {
          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected to fail during storm
          }
        }
      });

      const avgStormTime = duration / stormOperations;
      console.log(`Circuit breaker storm: ${duration.toFixed(2)}ms for ${stormOperations} operations`);
      console.log(`Average time during storm: ${avgStormTime.toFixed(4)}ms`);

      // Should maintain reasonable performance even during storms
      expect(avgStormTime).toBeLessThan(1); // Less than 1ms per operation during storm
    });
  });

  describe('Circuit Breaker State Persistence', () => {
    it('should handle state persistence operations efficiently', async () => {
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        // Simulate state persistence operations
        for (let i = 0; i < 1000; i++) {
          // Simulate state changes that might trigger persistence
          provider.setFailureMode('network', i % 5 === 0);

          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected for failures
          }
        }
      });

      const avgPersistenceTime = duration / 1000;
      console.log(`State persistence: ${duration.toFixed(2)}ms for 1000 operations`);
      console.log(`Average persistence time: ${avgPersistenceTime.toFixed(4)}ms`);

      expect(avgPersistenceTime).toBeLessThan(1); // Should be very fast
    });
  });

  describe('Circuit Breaker Edge Cases', () => {
    it('should handle rapid state oscillations efficiently', async () => {
      const oscillations = 1000;

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        for (let i = 0; i < oscillations; i++) {
          // Rapidly switch between success and failure
          provider.setFailureMode('network', i % 2 === 0);

          try {
            await provider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected for failures
          }
        }
      });

      const avgOscillationTime = duration / oscillations;
      console.log(`State oscillations: ${duration.toFixed(2)}ms for ${oscillations} oscillations`);
      console.log(`Average oscillation time: ${avgOscillationTime.toFixed(4)}ms`);

      // Should handle oscillations efficiently
      expect(avgOscillationTime).toBeLessThan(1); // Less than 1ms per oscillation
    });

    it('should handle zero-downtime state changes', async () => {
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        // Rapid state changes
        for (let i = 0; i < 10000; i++) {
          provider.setFailureMode('network', i % 100 < 50);
          provider.setHealthCheck(i % 100 < 75);
          provider.setDelay(Math.floor(i / 100) * 10);
        }
      });

      const avgChangeTime = duration / 10000;
      console.log(`Zero-downtime changes: ${duration.toFixed(2)}ms for 10000 changes`);
      console.log(`Average change time: ${avgChangeTime.toFixed(4)}ms`);

      expect(avgChangeTime).toBeLessThan(0.1); // Extremely fast state changes
    });
  });

  describe('Circuit Breaker Resource Cleanup', () => {
    it('should cleanup resources efficiently', async () => {
      // Create many providers and destroy them
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const providers = [];

        for (let i = 0; i < 1000; i++) {
          const testProvider = new MockProviderAdapter(`provider_${i}`);
          testProvider.setFailureMode('network', i % 3 === 0);

          try {
            await testProvider.quote(TestDataFactory.createShipmentInput());
          } catch (error) {
            // Expected for failures
          }

          providers.push(testProvider);
        }

        // Cleanup
        providers.length = 0;
      });

      console.log(`Resource cleanup: ${duration.toFixed(2)}ms for 1000 providers`);

      // Should cleanup efficiently
      expect(duration).toBeLessThan(5000); // Less than 5 seconds for cleanup
    });
  });

  describe('Circuit Breaker Scalability', () => {
    it('should scale with multiple circuit breakers', async () => {
      const numProviders = 100;
      const providers = Array.from({ length: numProviders }, (_, i) =>
        new MockProviderAdapter(`provider_${i}`)
      );

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = providers.map(async (provider) => {
          provider.setFailureMode('network', true);

          for (let i = 0; i < 10; i++) {
            try {
              await provider.quote(TestDataFactory.createShipmentInput());
            } catch (error) {
              // Expected to fail
            }
          }
        });

        await Promise.all(promises);
      });

      const totalOperations = numProviders * 10;
      const avgTime = duration / totalOperations;

      console.log(`Multiple circuit breakers: ${duration.toFixed(2)}ms for ${totalOperations} operations`);
      console.log(`Average time per operation: ${avgTime.toFixed(4)}ms`);

      // Should scale well
      expect(avgTime).toBeLessThan(2); // Less than 2ms per operation across all providers
    });
  });

  describe('Circuit Breaker Timing Accuracy', () => {
    it('should maintain accurate timing under load', async () => {
      const startTime = performance.now();

      // Perform operations with controlled delays
      provider.setDelay(10); // 10ms delay
      provider.setFailureMode('network', false);

      const operations = 100;
      const promises = [];

      for (let i = 0; i < operations; i++) {
        promises.push(provider.quote(TestDataFactory.createShipmentInput()));
      }

      await Promise.all(promises);

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const expectedMinimumTime = operations * 10; // At least 10ms per operation

      console.log(`Timing accuracy: ${totalTime.toFixed(2)}ms total, expected minimum: ${expectedMinimumTime}ms`);

      // Should respect timing constraints
      expect(totalTime).toBeGreaterThan(expectedMinimumTime * 0.9); // Within 10% of expected minimum
    });
  });
});