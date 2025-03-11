/**
 * Server Monitoring Script
 * 
 * This script helps monitor server health and diagnose issues like ERR_INSUFFICIENT_RESOURCES
 * Run this with: node server-monitor.js
 */

const http = require('http');
const https = require('https');
const os = require('os');
const url = require('url');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'https://fishcad.com';
const CHECK_INTERVAL = process.env.CHECK_INTERVAL ? parseInt(process.env.CHECK_INTERVAL) : 60000; // 1 minute
const ALERTS_ENABLED = process.env.ALERTS_ENABLED !== 'false';
const USER_ID_TO_TEST = process.env.USER_ID_TO_TEST || 'v3bLSjgi4NUnIj0NJJA2A0lcQbj2';

// Memory thresholds for alerts (in MB)
const MEMORY_THRESHOLD_WARNING = 500; // 500 MB
const MEMORY_THRESHOLD_CRITICAL = 800; // 800 MB

// Monitoring state
let consecutiveFailures = 0;
let lastSuccessTime = Date.now();

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Make an HTTP request with promise and timeout
 */
function makeRequest(requestUrl, options = {}) {
  return new Promise((resolve, reject) => {
    // Parse URL to determine if we need http or https
    const parsedUrl = url.parse(requestUrl);
    const httpModule = parsedUrl.protocol === 'https:' ? https : http;
    
    // Set default timeout
    options.timeout = options.timeout || 30000; // 30 seconds
    
    const req = httpModule.request(requestUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

/**
 * Check server status
 */
async function checkServerStatus() {
  try {
    console.log(`\n${colors.cyan}[${new Date().toISOString()}] Checking server status...${colors.reset}`);
    
    // Check system memory
    const systemMemory = {
      total: Math.round(os.totalmem() / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024),
      used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)
    };
    systemMemory.usedPercent = Math.round((systemMemory.used / systemMemory.total) * 100);
    
    console.log(`${colors.blue}System Memory: ${systemMemory.used} MB used of ${systemMemory.total} MB total (${systemMemory.usedPercent}%)${colors.reset}`);
    
    // Memory warning
    if (systemMemory.used > MEMORY_THRESHOLD_WARNING) {
      const message = systemMemory.used > MEMORY_THRESHOLD_CRITICAL
        ? `${colors.red}CRITICAL: System memory usage is very high!${colors.reset}`
        : `${colors.yellow}WARNING: System memory usage is high${colors.reset}`;
      console.log(message);
    }
    
    // Check status endpoint
    const statusResponse = await makeRequest(`${SERVER_URL}/api/status`);
    
    if (statusResponse.statusCode !== 200) {
      throw new Error(`Status endpoint returned ${statusResponse.statusCode}`);
    }
    
    // Parse status response
    const statusData = JSON.parse(statusResponse.data);
    console.log(`${colors.green}Server Status: ${statusData.status}${colors.reset}`);
    console.log(`Server Memory: ${statusData.memoryUsage.heapUsed} used of ${statusData.memoryUsage.heapTotal} allocated`);
    console.log(`Environment: ${statusData.environment}, Stripe Mode: ${statusData.stripeMode}`);
    console.log(`Server Uptime: ${statusData.uptime}`);
    
    // Check subscription endpoints
    const subscriptionUrl = `${SERVER_URL}/api/pricing/optimize-subscription/${USER_ID_TO_TEST}?_t=${Date.now()}`;
    console.log(`Testing subscription endpoint: ${subscriptionUrl}`);
    
    try {
      const subResponse = await makeRequest(subscriptionUrl);
      
      if (subResponse.statusCode === 200) {
        const subData = JSON.parse(subResponse.data);
        console.log(`${colors.green}Subscription Status: OK${colors.reset}`);
        console.log(`User Pro Status: ${subData.isPro ? 'PRO' : 'FREE'}`);
        console.log(`Plan: ${subData.subscriptionPlan}, Status: ${subData.subscriptionStatus}`);
        
        // Update monitoring state
        consecutiveFailures = 0;
        lastSuccessTime = Date.now();
      } else {
        throw new Error(`Subscription endpoint returned ${subResponse.statusCode}`);
      }
    } catch (subError) {
      consecutiveFailures++;
      console.log(`${colors.red}Subscription Endpoint Error: ${subError.message}${colors.reset}`);
      console.log(`Consecutive failures: ${consecutiveFailures}`);
      
      if (ALERTS_ENABLED && consecutiveFailures >= 3) {
        console.log(`${colors.red}ALERT: Multiple consecutive failures detected!${colors.reset}`);
        // Here you could implement email/SMS alerts if needed
      }
    }
    
  } catch (error) {
    console.log(`${colors.red}Error checking server status: ${error.message}${colors.reset}`);
    consecutiveFailures++;
    
    if (ALERTS_ENABLED && consecutiveFailures >= 3) {
      console.log(`${colors.red}ALERT: Server may be down!${colors.reset}`);
      // Here you could implement email/SMS alerts if needed
    }
  }
}

// Initial check
checkServerStatus();

// Schedule regular checks
setInterval(checkServerStatus, CHECK_INTERVAL);

console.log(`${colors.cyan}Server monitor started. Checking every ${CHECK_INTERVAL / 1000} seconds.${colors.reset}`);
console.log(`Press Ctrl+C to stop monitoring.`);

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\nMonitoring stopped.');
  process.exit(0);
}); 