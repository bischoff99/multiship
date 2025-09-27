import { TestDatabaseUtils } from '../test-utils.js';

// Test database interface for the provider system
export interface TestDbSchema {
  shipments: {
    id: string;
    provider: string;
    externalId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    data: any;
  };
  rates: {
    id: string;
    shipmentId: string;
    provider: string;
    rateId: string;
    amount: number;
    currency: string;
    service: string;
    carrier: string;
    createdAt: string;
  };
  cache_entries: {
    id: string;
    key: string;
    value: any;
    ttl: number;
    createdAt: string;
    expiresAt: string;
  };
  circuit_breaker_states: {
    id: string;
    provider: string;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailureTime: string;
    updatedAt: string;
  };
}

export class TestDatabaseManager {
  private db: Map<keyof TestDbSchema, any[]> = new Map();

  constructor() {
    this.initializeCollections();
  }

  private initializeCollections(): void {
    this.db.set('shipments', []);
    this.db.set('rates', []);
    this.db.set('cache_entries', []);
    this.db.set('circuit_breaker_states', []);
  }

  async setup(): Promise<void> {
    await TestDatabaseUtils.setupInMemoryDb();
    this.initializeCollections();
  }

  async teardown(): Promise<void> {
    await TestDatabaseUtils.teardownInMemoryDb();
    this.db.clear();
  }

  // Generic CRUD operations
  async insert<T extends keyof TestDbSchema>(
    collection: T,
    data: Omit<TestDbSchema[T], 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const document = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now
    } as TestDbSchema[T];

    const collectionData = this.db.get(collection) || [];
    collectionData.push(document);
    this.db.set(collection, collectionData);

    await TestDatabaseUtils.insertDocument(collection, document);
    return id;
  }

  async findById<T extends keyof TestDbSchema>(
    collection: T,
    id: string
  ): Promise<TestDbSchema[T] | null> {
    const collectionData = this.db.get(collection) || [];
    return collectionData.find(doc => doc.id === id) || null;
  }

  async findMany<T extends keyof TestDbSchema>(
    collection: T,
    query: Partial<TestDbSchema[T]> = {}
  ): Promise<TestDbSchema[T][]> {
    const collectionData = this.db.get(collection) || [];

    if (Object.keys(query).length === 0) {
      return collectionData;
    }

    return collectionData.filter(doc => {
      return Object.entries(query).every(([key, value]) => doc[key] === value);
    });
  }

  async update<T extends keyof TestDbSchema>(
    collection: T,
    id: string,
    updates: Partial<TestDbSchema[T]>
  ): Promise<boolean> {
    const collectionData = this.db.get(collection) || [];
    const index = collectionData.findIndex(doc => doc.id === id);

    if (index === -1) {
      return false;
    }

    collectionData[index] = {
      ...collectionData[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.db.set(collection, collectionData);
    return true;
  }

  async delete<T extends keyof TestDbSchema>(
    collection: T,
    id: string
  ): Promise<boolean> {
    const collectionData = this.db.get(collection) || [];
    const filteredData = collectionData.filter(doc => doc.id !== id);

    if (filteredData.length === collectionData.length) {
      return false; // No document was removed
    }

    this.db.set(collection, filteredData);
    return true;
  }

  async count<T extends keyof TestDbSchema>(
    collection: T,
    query: Partial<TestDbSchema[T]> = {}
  ): Promise<number> {
    const collectionData = this.db.get(collection) || [];

    if (Object.keys(query).length === 0) {
      return collectionData.length;
    }

    return collectionData.filter(doc => {
      return Object.entries(query).every(([key, value]) => doc[key] === value);
    }).length;
  }

  // Specialized methods for testing
  async seedTestShipments(count = 10): Promise<string[]> {
    const shipmentIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const id = await this.insert('shipments', {
        provider: ['easypost', 'shippo', 'veeqo'][i % 3],
        externalId: `ext_${i}`,
        status: ['pending', 'processing', 'completed', 'failed'][i % 4],
        data: {
          from: { city: 'Test City', state: 'CA', zip: '12345' },
          to: { city: 'Destination City', state: 'NY', zip: '67890' },
          parcel: { weight: 2.5, dimensions: { length: 12, width: 8, height: 6 } }
        }
      });
      shipmentIds.push(id);
    }

    return shipmentIds;
  }

  async seedTestRates(shipmentIds: string[], ratesPerShipment = 3): Promise<string[]> {
    const rateIds: string[] = [];

    for (const shipmentId of shipmentIds) {
      for (let i = 0; i < ratesPerShipment; i++) {
        const id = await this.insert('rates', {
          shipmentId,
          provider: ['easypost', 'shippo', 'veeqo'][i % 3],
          rateId: `rate_${shipmentId}_${i}`,
          amount: Math.round((5 + Math.random() * 20) * 100), // $5-$25 in cents
          currency: 'USD',
          service: ['Ground', 'Express', 'Priority'][i % 3],
          carrier: ['USPS', 'FedEx', 'UPS'][i % 3]
        });
        rateIds.push(id);
      }
    }

    return rateIds;
  }

  async seedTestCacheEntries(count = 20): Promise<string[]> {
    const cacheIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const ttl = [300000, 600000, 3600000][i % 3]; // 5min, 10min, 1hr
      const id = await this.insert('cache_entries', {
        key: `cache_key_${i}`,
        value: {
          provider: ['easypost', 'shippo', 'veeqo'][i % 3],
          data: `cached_data_${i}`,
          timestamp: Date.now()
        },
        ttl,
        expiresAt: new Date(Date.now() + ttl).toISOString()
      });
      cacheIds.push(id);
    }

    return cacheIds;
  }

  async seedTestCircuitBreakerStates(): Promise<string[]> {
    const providerStates = [
      { provider: 'easypost', state: 'CLOSED' as const, failures: 0 },
      { provider: 'shippo', state: 'OPEN' as const, failures: 5 },
      { provider: 'veeqo', state: 'HALF_OPEN' as const, failures: 2 }
    ];

    const circuitBreakerIds: string[] = [];

    for (const state of providerStates) {
      const id = await this.insert('circuit_breaker_states', {
        provider: state.provider,
        state: state.state,
        failures: state.failures,
        lastFailureTime: state.failures > 0 ? new Date(Date.now() - 60000).toISOString() : new Date().toISOString()
      });
      circuitBreakerIds.push(id);
    }

    return circuitBreakerIds;
  }

  async cleanupExpiredCache(): Promise<number> {
    const collectionData = this.db.get('cache_entries') || [];
    const now = new Date().toISOString();
    const expiredIds: string[] = [];

    const validEntries = collectionData.filter(entry => {
      if (entry.expiresAt < now) {
        expiredIds.push(entry.id);
        return false;
      }
      return true;
    });

    this.db.set('cache_entries', validEntries);
    return expiredIds.length;
  }

  async getCircuitBreakerState(provider: string) {
    const states = this.db.get('circuit_breaker_states') || [];
    return states.find(state => state.provider === provider) || null;
  }

  async updateCircuitBreakerState(
    provider: string,
    updates: Partial<TestDbSchema['circuit_breaker_states']>
  ): Promise<void> {
    const states = this.db.get('circuit_breaker_states') || [];
    const index = states.findIndex(state => state.provider === provider);

    if (index >= 0) {
      states[index] = {
        ...states[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
    } else {
      await this.insert('circuit_breaker_states', {
        provider,
        state: 'CLOSED',
        failures: 0,
        lastFailureTime: new Date().toISOString(),
        ...updates
      });
    }

    this.db.set('circuit_breaker_states', states);
  }

  // Test data validation helpers
  async validateShipmentData(shipmentId: string): Promise<boolean> {
    const shipment = await this.findById('shipments', shipmentId);
    if (!shipment) return false;

    return Boolean(
      shipment.data?.from?.city &&
      shipment.data?.to?.city &&
      shipment.data?.parcel?.weight &&
      shipment.provider &&
      shipment.status
    );
  }

  async validateRateData(rateId: string): Promise<boolean> {
    const rate = await this.findById('rates', rateId);
    if (!rate) return false;

    return Boolean(
      rate.amount > 0 &&
      rate.currency &&
      rate.service &&
      rate.carrier &&
      rate.provider
    );
  }

  // Database health and statistics
  async getCollectionStats(): Promise<Record<keyof TestDbSchema, number>> {
    const stats: Partial<Record<keyof TestDbSchema, number>> = {};

    for (const collection of this.db.keys()) {
      stats[collection] = this.db.get(collection)?.length || 0;
    }

    return stats as Record<keyof TestDbSchema, number>;
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Try to perform a simple operation to check if DB is responsive
      await this.count('shipments');
      return true;
    } catch (error) {
      return false;
    }
  }

  // Migration testing utilities
  async simulateMigration(fromVersion: string, toVersion: string): Promise<void> {
    // Simulate schema migration
    console.log(`Migrating database from ${fromVersion} to ${toVersion}`);

    // Update all timestamps to simulate migration
    for (const collection of this.db.keys()) {
      const data = this.db.get(collection) || [];
      const updatedData = data.map(item => ({
        ...item,
        updatedAt: new Date().toISOString(),
        migratedFrom: fromVersion,
        migratedTo: toVersion
      }));

      this.db.set(collection, updatedData);
    }
  }

  // Backup and restore utilities for testing
  async createBackup(): Promise<string> {
    const backupId = `backup_${Date.now()}`;
    const backup = {
      id: backupId,
      timestamp: new Date().toISOString(),
      data: Object.fromEntries(this.db.entries())
    };

    await TestDatabaseUtils.insertDocument('backups', backup);
    return backupId;
  }

  async restoreFromBackup(backupId: string): Promise<boolean> {
    const backup = await TestDatabaseUtils.findDocument('backups', { id: backupId });
    if (!backup) return false;

    this.db = new Map(Object.entries(backup.data)) as Map<keyof TestDbSchema, any[]>;
    return true;
  }
}

// Global test database instance
export const testDb = new TestDatabaseManager();

// Test database setup and teardown utilities
export async function setupTestDatabase(): Promise<void> {
  await testDb.setup();
}

export async function teardownTestDatabase(): Promise<void> {
  await testDb.teardown();
}

// Database transaction utilities for testing
export class TestDatabaseTransaction {
  private operations: Array<() => Promise<void>> = [];
  private rollbacks: Array<() => Promise<void>> = [];

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const result = await operation();
    this.operations.push(async () => { /* operation already executed */ });
    return result;
  }

  async addRollback(rollback: () => Promise<void>): Promise<void> {
    this.rollbacks.push(rollback);
  }

  async rollback(): Promise<void> {
    for (const rollback of this.rollbacks.reverse()) {
      try {
        await rollback();
      } catch (error) {
        console.error('Error during rollback:', error);
      }
    }
  }

  async commit(): Promise<void> {
    // In a real implementation, this would commit the transaction
    // For testing, we just clear the rollback operations
    this.rollbacks = [];
  }
}

// Test data seeding utilities
export class TestDataSeeder {
  static async seedBasicTestData(): Promise<{
    shipmentIds: string[];
    rateIds: string[];
    cacheIds: string[];
    circuitBreakerIds: string[];
  }> {
    const shipmentIds = await testDb.seedTestShipments(5);
    const rateIds = await testDb.seedTestRates(shipmentIds, 2);
    const cacheIds = await testDb.seedTestCacheEntries(10);
    const circuitBreakerIds = await testDb.seedTestCircuitBreakerStates();

    return {
      shipmentIds,
      rateIds,
      cacheIds,
      circuitBreakerIds
    };
  }

  static async seedProviderTestData(provider: string): Promise<{
    shipmentIds: string[];
    rateIds: string[];
  }> {
    const shipmentIds = await testDb.seedTestShipments(3);
    const rateIds = await testDb.seedTestRates(shipmentIds, 3);

    // Update shipments to use specific provider
    for (const shipmentId of shipmentIds) {
      await testDb.update('shipments', shipmentId, { provider });
    }

    return { shipmentIds, rateIds };
  }

  static async seedCacheTestData(): Promise<string[]> {
    return await testDb.seedTestCacheEntries(15);
  }

  static async seedCircuitBreakerTestData(): Promise<string[]> {
    return await testDb.seedTestCircuitBreakerStates();
  }

  static async clearAllData(): Promise<void> {
    for (const collection of ['shipments', 'rates', 'cache_entries', 'circuit_breaker_states'] as const) {
      const data = testDb['db'].get(collection) || [];
      for (const item of data) {
        await testDb.delete(collection, item.id);
      }
    }
  }
}

// Database assertion utilities for tests
export class TestDatabaseAssertions {
  static async expectCollectionCount(
    collection: keyof TestDbSchema,
    expectedCount: number
  ): Promise<void> {
    const actualCount = await testDb.count(collection);
    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${collection} to have ${expectedCount} documents, but found ${actualCount}`
      );
    }
  }

  static async expectDocumentExists(
    collection: keyof TestDbSchema,
    id: string
  ): Promise<void> {
    const document = await testDb.findById(collection, id);
    if (!document) {
      throw new Error(`Expected ${collection} document with id ${id} to exist`);
    }
  }

  static async expectDocumentNotExists(
    collection: keyof TestDbSchema,
    id: string
  ): Promise<void> {
    const document = await testDb.findById(collection, id);
    if (document) {
      throw new Error(`Expected ${collection} document with id ${id} to not exist`);
    }
  }

  static async expectDocumentMatches(
    collection: keyof TestDbSchema,
    id: string,
    expectedData: Partial<TestDbSchema[keyof TestDbSchema]>
  ): Promise<void> {
    const document = await testDb.findById(collection, id);
    if (!document) {
      throw new Error(`Document with id ${id} not found in ${collection}`);
    }

    for (const [key, expectedValue] of Object.entries(expectedData)) {
      const actualValue = (document as any)[key];
      if (actualValue !== expectedValue) {
        throw new Error(
          `Document ${id} in ${collection}: expected ${key} to be ${expectedValue}, but got ${actualValue}`
        );
      }
    }
  }
}