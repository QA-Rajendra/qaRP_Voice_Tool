function createRateLimiter({ windowMs = 60_000, max = 30, message = 'Too many requests. Please try again shortly.' } = {}) {
  const clients = new Map();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let record = clients.get(key);
    if (!record || now >= record.resetAt) record = { count: 0, resetAt: now + windowMs };
    record.count += 1;
    clients.set(key, record);
    response.setHeader('RateLimit-Limit', max);
    response.setHeader('RateLimit-Remaining', Math.max(0, max - record.count));
    response.setHeader('RateLimit-Reset', Math.ceil(record.resetAt / 1000));
    if (record.count > max) {
      const error = new Error(message);
      error.status = 429;
      error.code = 'RATE_LIMITED';
      return next(error);
    }
    return next();
  };
}

module.exports = { createRateLimiter };
