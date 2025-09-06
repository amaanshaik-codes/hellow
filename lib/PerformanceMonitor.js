// Real-time performance monitoring and optimization
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      messageLatency: [],
      renderTime: [],
      memoryUsage: [],
      networkRequests: new Map(),
      userInteractions: []
    };
    this.observers = new Set();
  }

  // Monitor Core Web Vitals
  initializeCoreWebVitals() {
    // Largest Contentful Paint
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('LCP', entry.startTime);
      }
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // First Input Delay
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('FID', entry.processingStart - entry.startTime);
      }
    }).observe({ entryTypes: ['first-input'] });

    // Cumulative Layout Shift
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          this.recordMetric('CLS', entry.value);
        }
      }
    }).observe({ entryTypes: ['layout-shift'] });
  }

  // Monitor message round-trip time
  trackMessageLatency(messageId, startTime) {
    const latency = Date.now() - startTime;
    this.metrics.messageLatency.push({
      messageId,
      latency,
      timestamp: Date.now()
    });
    
    // Keep only last 100 measurements
    if (this.metrics.messageLatency.length > 100) {
      this.metrics.messageLatency.shift();
    }

    // Alert if latency is consistently high
    if (this.getAverageLatency() > 2000) {
      this.notifyPerformanceIssue('HIGH_LATENCY', { averageLatency: this.getAverageLatency() });
    }
  }

  // Monitor memory usage for memory leaks
  monitorMemoryUsage() {
    if ('memory' in performance) {
      const usage = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };

      this.metrics.memoryUsage.push(usage);
      
      // Keep only last 50 measurements
      if (this.metrics.memoryUsage.length > 50) {
        this.metrics.memoryUsage.shift();
      }

      // Check for memory leak (consistently increasing usage)
      if (this.detectMemoryLeak()) {
        this.notifyPerformanceIssue('MEMORY_LEAK', usage);
      }
    }
  }

  // Detect potential memory leaks
  detectMemoryLeak() {
    if (this.metrics.memoryUsage.length < 10) return false;
    
    const recent = this.metrics.memoryUsage.slice(-10);
    const trend = recent.reduce((acc, curr, index) => {
      if (index === 0) return 0;
      return acc + (curr.used - recent[index - 1].used);
    }, 0);

    return trend > 10 * 1024 * 1024; // 10MB increase
  }

  // Generate performance report
  generateReport() {
    return {
      timestamp: Date.now(),
      averageLatency: this.getAverageLatency(),
      memoryTrend: this.getMemoryTrend(),
      networkHealth: this.getNetworkHealth(),
      recommendations: this.getRecommendations()
    };
  }

  getAverageLatency() {
    if (this.metrics.messageLatency.length === 0) return 0;
    const sum = this.metrics.messageLatency.reduce((acc, m) => acc + m.latency, 0);
    return sum / this.metrics.messageLatency.length;
  }
}
