import { CircuitBreaker } from '../../utils/circuit-breaker.js';
import { Logger } from '../../utils/logger.js';
import { CircuitBreakerError } from '../../errors/provider-errors.js';
import { TestTimeUtils, TestAssertions } from '../test-utils.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let logger: Logger;
  let mockLogger: any;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      logCircuitBreaker: jest.fn(),
      context: { provider: 'test-provider' }
    };

    logger = mockLogger as any;

    circuitBreaker = new CircuitBreaker(
      {
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        halfOpenMaxCalls: 2,
        monitoringPeriodMs: 5000
      },
      logger
    );
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failures).toBe(0);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should have correct initial statistics', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failures).toBe(0);
      expect(stats.canExecute).toBe(true);
      expect(stats.halfOpenCalls).toBe(0);
    });
  });

  describe('CLOSED State Behavior', () => {
    it('should allow execution in CLOSED state', () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should reset failure count on success', async () => {
      // Simulate some failures first
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState().failures).toBe(2);

      // Success should reset failures
      circuitBreaker.onSuccess();
      expect(circuitBreaker.getState().failures).toBe(0);
    });

    it('should transition to OPEN when failure threshold is reached', () => {
      const config = {
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        halfOpenMaxCalls: 2,
        monitoringPeriodMs: 5000
      };

      circuitBreaker = new CircuitBreaker(config, logger);

      // Fail 3 times to reach threshold
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(circuitBreaker.canExecute()).toBe(false);
      expect(mockLogger.logCircuitBreaker).toHaveBeenCalledWith(
        'OPEN',
        expect.stringContaining('Failure threshold 3 reached')
      );
    });
  });

  describe('OPEN State Behavior', () => {
    beforeEach(() => {
      // Force circuit breaker to OPEN state
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
    });

    it('should block execution in OPEN state', () => {
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should transition to HALF_OPEN after recovery timeout', () => {
      // Advance time past recovery timeout
      jest.advanceTimersByTime(1001); // Just over recovery timeout
      
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState().state).toBe('HALF_OPEN');
      expect(mockLogger.logCircuitBreaker).toHaveBeenCalledWith(
        'HALF_OPEN',
        expect.stringContaining('Recovery timeout reached')
      );
    });

    it('should not transition to HALF_OPEN before recovery timeout', () => {
      // Advance time but not enough
      jest.advanceTimersByTime(999); // Just under recovery timeout
      
      expect(circuitBreaker.canExecute()).toBe(false);
      expect(circuitBreaker.getState().state).toBe('OPEN');
    });
  });

  describe('HALF_OPEN State Behavior', () => {
    beforeEach(() => {
      // Force to OPEN state first
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      
      // Then advance time to trigger HALF_OPEN
      jest.advanceTimersByTime(1001);
    });

    it('should allow limited execution in HALF_OPEN state', () => {
      expect(circuitBreaker.getState().state).toBe('HALF_OPEN');
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should transition to CLOSED after successful calls', () => {
      const config = {
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        halfOpenMaxCalls: 2,
        monitoringPeriodMs: 5000
      };

      circuitBreaker = new CircuitBreaker(config, logger);

      // Force to HALF_OPEN state
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      jest.advanceTimersByTime(1001);

      // Make successful calls
      circuitBreaker.onSuccess();
      circuitBreaker.onSuccess();

      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(mockLogger.logCircuitBreaker).toHaveBeenCalledWith(
        'CLOSED',
        expect.stringContaining('Service recovered successfully')
      );
    });

    it('should transition back to OPEN on failure', () => {
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(mockLogger.logCircuitBreaker).toHaveBeenCalledWith(
        'OPEN',
        expect.stringContaining('Failure threshold')
      );
    });

    it('should limit calls in HALF_OPEN state', () => {
      const config = {
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        halfOpenMaxCalls: 1,
        monitoringPeriodMs: 5000
      };

      circuitBreaker = new CircuitBreaker(config, logger);

      // Force to HALF_OPEN state
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      jest.advanceTimersByTime(1001);

      // First call should be allowed
      expect(circuitBreaker.canExecute()).toBe(true);
      circuitBreaker.onSuccess();

      // Second call should be blocked
      expect(circuitBreaker.canExecute()).toBe(false);
    });
  });

  describe('Execute Method', () => {
    it('should execute successful operations', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation, 'test-operation');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw CircuitBreakerError when circuit is open', async () => {
      // Force circuit breaker to OPEN state
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      const operation = jest.fn().mockResolvedValue('success');

      await TestAssertions.expectToThrow(
        () => circuitBreaker.execute(operation, 'test-operation'),
        CircuitBreakerError
      );

      expect(operation).not.toHaveBeenCalled();
    });

    it('should propagate operation errors', async () => {
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(circuitBreaker.execute(operation, 'test-operation'))
        .rejects.toThrow('Operation failed');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should record failures and successes correctly', async () => {
      const successOperation = jest.fn().mockResolvedValue('success');
      const failOperation = jest.fn().mockRejectedValue(new Error('fail'));

      // Successful operation
      await circuitBreaker.execute(successOperation, 'success');
      expect(circuitBreaker.getState().failures).toBe(0);

      // Failed operation
      await expect(circuitBreaker.execute(failOperation, 'fail'))
        .rejects.toThrow('fail');
      expect(circuitBreaker.getState().failures).toBe(1);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset circuit breaker to initial state', () => {
      // Force to OPEN state
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Reset
      circuitBreaker.reset();

      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failures).toBe(0);
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker reset',
        { provider: 'test-provider' }
      );
    });
  });

  describe('Statistics', () => {
    it('should track statistics correctly', () => {
      const stats = circuitBreaker.getStats();
      
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('lastFailureTime');
      expect(stats).toHaveProperty('halfOpenCalls');
      expect(stats).toHaveProperty('timeSinceLastStateChange');
      expect(stats).toHaveProperty('canExecute');
    });

    it('should update statistics on state changes', () => {
      const initialStats = circuitBreaker.getStats();
      expect(initialStats.state).toBe('CLOSED');

      circuitBreaker.onFailure();
      const afterFailureStats = circuitBreaker.getStats();
      expect(afterFailureStats.failures).toBe(1);
      expect(afterFailureStats.lastFailureTime).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state transitions', () => {
      // Rapid failures
      for (let i = 0; i < 10; i++) {
        circuitBreaker.onFailure();
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(circuitBreaker.getState().failures).toBe(10);

      // Advance time and test recovery
      jest.advanceTimersByTime(1001);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should handle concurrent operations safely', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => 
        circuitBreaker.execute(
          () => Promise.resolve(`result-${i}`),
          `operation-${i}`
        )
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
      expect(results.every((result, i) => result === `result-${i}`)).toBe(true);
    });
  });
});