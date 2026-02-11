/**
 * Telegram API Connectivity Diagnostic Tool
 * Tests various connectivity methods to identify why Node.js cannot reach Telegram API
 */

import https from 'https';
import dns from 'dns';
import { promisify } from 'util';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
const API_HOST = 'api.telegram.org';

const dnsLookup = promisify(dns.resolve4);

console.log('🔍 Telegram API Connectivity Diagnostic Tool\n');
console.log('='.repeat(60));

// Test 1: DNS Resolution
async function testDNS() {
  console.log('\n📍 Test 1: DNS Resolution');
  console.log('-'.repeat(60));

  try {
    const addresses = await dnsLookup(API_HOST);
    console.log('✅ DNS Resolution: SUCCESS');
    console.log(`   Resolved to: ${addresses.join(', ')}`);
    return addresses[0];
  } catch (err: any) {
    console.log('❌ DNS Resolution: FAILED');
    console.log(`   Error: ${err.code} - ${err.message}`);
    return null;
  }
}

// Test 2: Basic HTTPS GET (native Node.js)
async function testNativeHTTPS(): Promise<boolean> {
  console.log('\n🔗 Test 2: Native Node.js HTTPS');
  console.log('-'.repeat(60));

  return new Promise((resolve) => {
    const startTime = Date.now();

    const req = https.get(API_URL, { timeout: 10000 }, (res) => {
      const duration = Date.now() - startTime;
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('✅ Native HTTPS: SUCCESS');
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Response: ${data.substring(0, 100)}...`);
        resolve(true);
      });
    });

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log('❌ Native HTTPS: FAILED');
      console.log(`   Error Code: ${err.code}`);
      console.log(`   Error Message: ${err.message}`);
      console.log(`   Duration: ${duration}ms`);

      // Detailed error analysis
      if (err.code === 'ECONNREFUSED') {
        console.log('   💡 Diagnosis: Connection refused - firewall or wrong port');
      } else if (err.code === 'ETIMEDOUT') {
        console.log('   💡 Diagnosis: Connection timeout - network/firewall blocking');
      } else if (err.code === 'ENOTFOUND') {
        console.log('   💡 Diagnosis: DNS lookup failed');
      } else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        console.log('   💡 Diagnosis: TLS certificate issue - corporate proxy?');
      } else if (err.code === 'CERT_HAS_EXPIRED') {
        console.log('   💡 Diagnosis: TLS certificate expired');
      }

      resolve(false);
    });

    req.on('timeout', () => {
      console.log('❌ Native HTTPS: TIMEOUT');
      console.log('   Duration: 10000ms (timeout)');
      req.destroy();
      resolve(false);
    });
  });
}

// Test 3: HTTPS with TLS validation disabled
async function testHTTPSNoVerify(): Promise<boolean> {
  console.log('\n🔓 Test 3: HTTPS with TLS Verification Disabled');
  console.log('-'.repeat(60));
  console.log('   (Testing if corporate TLS inspection is the issue)');

  return new Promise((resolve) => {
    const startTime = Date.now();

    const req = https.get(
      API_URL,
      {
        timeout: 10000,
        rejectUnauthorized: false, // Disable TLS verification
      },
      (res) => {
        const duration = Date.now() - startTime;
        res.on('data', () => {});

        res.on('end', () => {
          console.log('✅ HTTPS (no verify): SUCCESS');
          console.log(`   Status: ${res.statusCode}`);
          console.log(`   Duration: ${duration}ms`);
          console.log('   💡 This suggests a TLS certificate validation issue!');
          resolve(true);
        });
      }
    );

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log('❌ HTTPS (no verify): FAILED');
      console.log(`   Error: ${err.code} - ${err.message}`);
      console.log(`   Duration: ${duration}ms`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('❌ HTTPS (no verify): TIMEOUT');
      req.destroy();
      resolve(false);
    });
  });
}

// Test 4: Direct IP connection
async function testDirectIP(ip: string): Promise<boolean> {
  console.log('\n🎯 Test 4: Direct IP Connection');
  console.log('-'.repeat(60));
  console.log(`   Connecting to IP: ${ip}`);

  return new Promise((resolve) => {
    const startTime = Date.now();

    const options = {
      host: ip,
      path: `/bot${BOT_TOKEN}/getMe`,
      headers: { Host: API_HOST },
      timeout: 10000,
    };

    const req = https.get(options, (res) => {
      const duration = Date.now() - startTime;
      res.on('data', () => {});

      res.on('end', () => {
        console.log('✅ Direct IP: SUCCESS');
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Duration: ${duration}ms`);
        resolve(true);
      });
    });

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log('❌ Direct IP: FAILED');
      console.log(`   Error: ${err.code} - ${err.message}`);
      console.log(`   Duration: ${duration}ms`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('❌ Direct IP: TIMEOUT');
      req.destroy();
      resolve(false);
    });
  });
}

// Test 5: Check environment variables
function testEnvironment() {
  console.log('\n🌍 Test 5: Environment Variables');
  console.log('-'.repeat(60));

  const proxyVars = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
  ];

  let hasProxy = false;

  proxyVars.forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      console.log(`   ${varName}: ${value}`);
      hasProxy = true;
    }
  });

  if (!hasProxy) {
    console.log('   No proxy environment variables detected');
  }

  // Check TLS settings
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    console.log('   ⚠️  NODE_TLS_REJECT_UNAUTHORIZED=0 (TLS verification disabled)');
  }
}

// Test 6: Test with node-fetch (used by Telegraf)
async function testNodeFetch(): Promise<boolean> {
  console.log('\n📦 Test 6: node-fetch (used by Telegraf)');
  console.log('-'.repeat(60));

  try {
    // Dynamic import since we're using ESM
    const fetch = (await import('node-fetch')).default;

    const startTime = Date.now();
    const response = await fetch(API_URL, { timeout: 10000 });
    const duration = Date.now() - startTime;
    const data = await response.text();

    console.log('✅ node-fetch: SUCCESS');
    console.log(`   Status: ${response.status}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Response: ${data.substring(0, 100)}...`);
    return true;
  } catch (err: any) {
    console.log('❌ node-fetch: FAILED');
    console.log(`   Error Type: ${err.type || err.code}`);
    console.log(`   Error Message: ${err.message}`);

    if (err.type === 'request-timeout') {
      console.log('   💡 Diagnosis: Request timeout in node-fetch');
    }

    return false;
  }
}

// Test 7: Network route test
async function testNetworkRoute() {
  console.log('\n🛣️  Test 7: Network Route Analysis');
  console.log('-'.repeat(60));

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Test with curl (should work)
    const { stdout: curlOut } = await execAsync(
      `curl -s -o /dev/null -w "%{http_code}" -m 5 "${API_URL}"`
    );
    console.log(`   curl HTTP status: ${curlOut.trim()}`);

    if (curlOut.trim() === '200') {
      console.log('   ✅ curl can reach Telegram API');
      console.log('   💡 This confirms the issue is specific to Node.js HTTPS');
    }
  } catch (err: any) {
    console.log(`   ❌ curl failed: ${err.message}`);
  }
}

// Main diagnostic function
async function runDiagnostics() {
  testEnvironment();

  const resolvedIP = await testDNS();

  const nativeHTTPSWorks = await testNativeHTTPS();

  if (!nativeHTTPSWorks) {
    await testHTTPSNoVerify();

    if (resolvedIP) {
      await testDirectIP(resolvedIP);
    }
  }

  await testNodeFetch();
  await testNetworkRoute();

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));

  if (nativeHTTPSWorks) {
    console.log('✅ Node.js can reach Telegram API successfully!');
    console.log('   The issue may have been temporary or already resolved.');
  } else {
    console.log('❌ Node.js cannot reach Telegram API');
    console.log('\n💡 RECOMMENDED ACTIONS:');
    console.log('   1. Check firewall rules blocking outbound HTTPS from Node.js');
    console.log('   2. Verify no corporate proxy/TLS inspection');
    console.log('   3. Test from different network/environment');
    console.log('   4. Use the manual import script as workaround:');
    console.log('      npx tsx server/scripts/manual-telegram-import.ts');
  }

  console.log('\n');
}

// Run diagnostics
runDiagnostics().catch(console.error);
