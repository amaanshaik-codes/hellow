// Enhanced error recovery and monitoring system
export class ErrorRecoveryManager {
  constructor() {
    this.failureHistory = new Map();
    this.circuitBreaker = new Map();
    this.recoveryStrategies = new Map();
  }

  // Circuit breaker pattern for API endpoints
  async executeWithCircuitBreaker(operation, endpoint) {
    const state = this.circuitBreaker.get(endpoint);
    
    if (state?.status === 'OPEN' && Date.now() - state.lastFailure < 30000) {
      throw new Error(`Circuit breaker OPEN for ${endpoint}`);
    }

    try {
      const result = await operation();
      this.recordSuccess(endpoint);
      return result;
    } catch (error) {
      this.recordFailure(endpoint, error);
      throw error;
    }
  }

  recordFailure(endpoint, error) {
    const history = this.failureHistory.get(endpoint) || [];
    history.push({ timestamp: Date.now(), error: error.message });
    
    // Keep only last 10 failures
    if (history.length > 10) history.shift();
    this.failureHistory.set(endpoint, history);

    // Open circuit if too many failures
    if (history.length >= 3) {
      this.circuitBreaker.set(endpoint, {
        status: 'OPEN',
        lastFailure: Date.now()
      });
    }
  }

  recordSuccess(endpoint) {
    this.failureHistory.delete(endpoint);
    this.circuitBreaker.delete(endpoint);
  }

  // Auto-recovery for common issues
  async attemptRecovery(error, context) {
    const strategies = {
      'Network Error': () => this.retryWithExponentialBackoff(context.operation),
      'IndexedDB Error': () => this.fallbackToLocalStorage(context),
      'Socket Disconnect': () => this.reconnectSocket(context),
      'KV Error': () => this.fallbackToInMemory(context)
    };

    const strategy = strategies[error.type];
    if (strategy) {
      return await strategy();
    }
    
    throw error;
  }
}
