// server/src/controllers/adminController.js
const { prisma, redisClient } = require('../config/db');
const http = require('http'); // Built-in Node module to fetch internal metrics safely

// Private Helper to safely parse raw text from local Nginx stub_status endpoint
const fetchNginxStubData = () => {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: 80,
      path: '/nginx_status',
      method: 'GET',
      timeout: 1000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error();
          
          const lines = data.split('\n');
          // Format line 1: "Active connections: X"
          const nginxActiveConnections = parseInt(lines[0].match(/\d+/)[0], 10);
          
          // Format line 3: " server accepts handled requests\n  Y Z W"
          const requestLineTokens = lines[2].trim().split(/\s+/);
          const nginxTotalRequests = parseInt(requestLineTokens[2], 10);

          resolve({ nginxActiveConnections, nginxTotalRequests, nginxStatus: "HEALTHY" });
        } catch {
          resolve({ nginxActiveConnections: 0, nginxTotalRequests: 0, nginxStatus: "ERROR" });
        }
      });
    });

    req.on('error', () => {
      resolve({ nginxActiveConnections: 0, nginxTotalRequests: 0, nginxStatus: "UNREACHABLE" });
    });
    req.end();
  });
};

exports.getSystemMetrics = async (req, res) => {
  try {
    if (!redisClient.isOpen) {
      return res.status(503).json({ error: "Redis cluster connectivity offline." });
    }

    // 1. Bulk resolve real-time counts from Redis RAM and Nginx internally
    const [
      activeConnections,
      totalSocketEvents,
      totalMessages,
      cacheHits,
      cacheMisses,
      rawLatencyList,
      nginxTelemetry
    ] = await Promise.all([
      redisClient.get('telemetry:active_connections'),
      redisClient.get('telemetry:total_socket_events'),
      redisClient.get('telemetry:total_messages_processed'),
      redisClient.get('telemetry:cache_hits'),
      redisClient.get('telemetry:cache_misses'),
      redisClient.lRange('telemetry:ai_latency_log', 0, 14), // Read last 15 ops
      fetchNginxStubData() // ⚡ Fresh Nginx Hook
    ]);

    // 2. Fetch historical totals from PostgreSQL disk to compute storage dimensions
    const dbMessageCount = await prisma.message.count();
    
    // Calculate approximate vector byte allocation sizes (Each Gemini vector has 768 dimensions * 4 bytes float)
    const approximateVectorBytes = dbMessageCount * 768 * 4;
    const vectorDataKB = (approximateVectorBytes / 1024).toFixed(1);

    // 3. GENERATE DYNAMIC HOURLY LOAD DATA CURVES (Simulating 7-hour sliding telemetry matrix)
    const baseMessagesCount = parseInt(totalMessages || '0', 10);
    const hourlyActivityLoad = [
      { hour: "08:00", count: Math.round(baseMessagesCount * 0.1) },
      { hour: "10:00", count: Math.round(baseMessagesCount * 0.3) },
      { hour: "12:00", count: Math.round(baseMessagesCount * 0.6) },
      { hour: "14:00", count: Math.round(baseMessagesCount * 0.9) },
      { hour: "16:00", count: baseMessagesCount },
    ];

    const hits = parseInt(cacheHits || '0', 10);
    const misses = parseInt(cacheMisses || '0', 10);
    const totalRequests = hits + misses;
    const cacheHitRatio = totalRequests > 0 ? ((hits / totalRequests) * 100).toFixed(1) : "100.0";

    const latencyHistory = rawLatencyList.map((val, idx) => ({
      operation: `Op-${idx + 1}`,
      ms: parseInt(val || '0', 10)
    })).reverse();

    const averageLatency = latencyHistory.length > 0 
      ? Math.round(latencyHistory.reduce((sum, obj) => sum + obj.ms, 0) / latencyHistory.length)
      : 0;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    // Return unified metrics bundle
    return res.json({
      activeConnections: parseInt(activeConnections || '0', 10),
      totalSocketEvents: parseInt(totalSocketEvents || '0', 10),
      totalMessagesProcessed: baseMessagesCount,
      cacheHitRatio: parseFloat(cacheHitRatio),
      averageAiLatencyMs: averageLatency,
      vectorDataKB: parseFloat(vectorDataKB),
      dbMessageCount,
      latencyHistory,
      hourlyActivityLoad,
      // ⚡ APPEND FRESH NGINX CORE METRICS
      nginxActiveConnections: nginxTelemetry.nginxActiveConnections,
      nginxTotalRequests: nginxTelemetry.nginxTotalRequests,
      nginxStatus: nginxTelemetry.nginxStatus
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};