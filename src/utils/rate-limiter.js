export class RateLimiter {
  /**
   * @param {number} maxRequests 
   * @param {number} windowMs 
   */
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  /**
   * Waits for a slot if the rate limit is exceeded.
   * @returns {Promise<void>}
   */
  async waitForSlot(signal = null) {
    if (signal?.aborted) {
      const error = new Error('Rate limiter wait aborted');
      error.name = 'AbortError';
      throw error;
    }
    const now = Date.now();
    
    // Remove old timestamps
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldest);
      if (waitTime > 0) {
        await new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, waitTime);
          const onAbort = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            const error = new Error('Rate limiter wait aborted');
            error.name = 'AbortError';
            reject(error);
          };
          signal?.addEventListener('abort', onAbort, { once: true });
          if (signal?.aborted) onAbort();
        });
      }
      // Recursively check again in case multiple requests are queuing
      return this.waitForSlot(signal);
    }
    
    this.timestamps.push(Date.now());
  }
}
