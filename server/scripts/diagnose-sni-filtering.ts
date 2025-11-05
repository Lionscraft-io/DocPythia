/**
 * SNI/TLS Fingerprint Filtering Diagnostic
 * Identifies specific filtering mechanism (SNI, IPv6, TLS fingerprint)
 */

import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const lookup = promisify(dns.lookup);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8578664234:AAHG0lJzyMHYQVRjSfHTub42CYc9zEreMm8';
const HOST = 'api.telegram.org';
const PATH = `/bot${BOT_TOKEN}/getMe`;

console.log('🔬 SNI/TLS Filtering Deep Diagnostic\n');
console.log('='.repeat(70));

// Test 1: DNS Resolution - IPv4 vs IPv6
async function testDNSResolution() {
  console.log('\n1️⃣  DNS Resolution Analysis');
  console.log('-'.repeat(70));

  try {
    // IPv4
    const ipv4Addrs = await resolve4(HOST);
    console.log(`✅ IPv4 addresses: ${ipv4Addrs.join(', ')}`);
  } catch (err: any) {
    console.log(`❌ IPv4 resolution failed: ${err.message}`);
  }

  try {
    // IPv6
    const ipv6Addrs = await resolve6(HOST);
    console.log(`✅ IPv6 addresses: ${ipv6Addrs.join(', ')}`);
  } catch (err: any) {
    console.log(`❌ IPv6 resolution failed: ${err.message}`);
  }

  // Check what Node.js dns.lookup returns (respects OS settings)
  try {
    const { address, family } = await lookup(HOST);
    console.log(`📌 Node.js lookup defaults to: ${address} (IPv${family})`);
    return { address, family };
  } catch (err: any) {
    console.log(`❌ Node.js lookup failed: ${err.message}`);
    return null;
  }
}

// Test 2: Force IPv4 connection
async function testForceIPv4() {
  console.log('\n2️⃣  Force IPv4 Connection');
  console.log('-'.repeat(70));

  return new Promise((resolve) => {
    const options = {
      host: HOST,
      path: PATH,
      family: 4, // Force IPv4
      timeout: 10000,
    };

    const startTime = Date.now();
    const req = https.get(options, (res) => {
      const duration = Date.now() - startTime;
      console.log(`✅ IPv4-only connection: SUCCESS`);
      console.log(`   Status: ${res.statusCode}, Duration: ${duration}ms`);
      res.on('data', () => {});
      res.on('end', () => resolve(true));
    });

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log(`❌ IPv4-only connection: FAILED`);
      console.log(`   Error: ${err.code} - ${err.message}`);
      console.log(`   Duration: ${duration}ms`);
      if (err.code === 'ETIMEDOUT') {
        console.log('   💡 IPv4 is also being filtered!');
      }
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ IPv4-only connection: TIMEOUT`);
      req.destroy();
      resolve(false);
    });
  });
}

// Test 3: Force IPv6 connection
async function testForceIPv6() {
  console.log('\n3️⃣  Force IPv6 Connection');
  console.log('-'.repeat(70));

  return new Promise((resolve) => {
    const options = {
      host: HOST,
      path: PATH,
      family: 6, // Force IPv6
      timeout: 10000,
    };

    const startTime = Date.now();
    const req = https.get(options, (res) => {
      const duration = Date.now() - startTime;
      console.log(`✅ IPv6-only connection: SUCCESS`);
      console.log(`   Status: ${res.statusCode}, Duration: ${duration}ms`);
      res.on('data', () => {});
      res.on('end', () => resolve(true));
    });

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log(`❌ IPv6-only connection: FAILED`);
      console.log(`   Error: ${err.code} - ${err.message}`);
      console.log(`   Duration: ${duration}ms`);
      if (err.code === 'ENETUNREACH') {
        console.log('   💡 No IPv6 connectivity available');
      } else if (err.code === 'ETIMEDOUT') {
        console.log('   💡 IPv6 is being filtered!');
      }
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ IPv6-only connection: TIMEOUT`);
      req.destroy();
      resolve(false);
    });
  });
}

// Test 4: Connection to IP directly (bypass SNI)
async function testDirectIP(ip: string) {
  console.log('\n4️⃣  Direct IP Connection (SNI Bypass Test)');
  console.log('-'.repeat(70));
  console.log(`   Connecting to: ${ip}`);

  return new Promise((resolve) => {
    const options = {
      host: ip,
      path: PATH,
      headers: { 'Host': HOST },
      servername: HOST, // This still sends SNI!
      timeout: 10000,
    };

    const startTime = Date.now();
    const req = https.get(options, (res) => {
      const duration = Date.now() - startTime;
      console.log(`✅ Direct IP (with SNI): SUCCESS`);
      console.log(`   Status: ${res.statusCode}, Duration: ${duration}ms`);
      res.on('data', () => {});
      res.on('end', () => resolve(true));
    });

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log(`❌ Direct IP (with SNI): FAILED`);
      console.log(`   Error: ${err.code} - ${err.message}`);
      console.log(`   Duration: ${duration}ms`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ Direct IP (with SNI): TIMEOUT`);
      req.destroy();
      resolve(false);
    });
  });
}

// Test 5: Connection to IP without SNI
async function testDirectIPNoSNI(ip: string) {
  console.log('\n5️⃣  Direct IP Without SNI');
  console.log('-'.repeat(70));
  console.log(`   Connecting to: ${ip} (no SNI field)`);

  return new Promise((resolve) => {
    const options = {
      host: ip,
      path: PATH,
      headers: { 'Host': HOST },
      servername: undefined, // Don't send SNI
      timeout: 10000,
      rejectUnauthorized: false, // Required when SNI doesn't match cert
    };

    const startTime = Date.now();
    const req = https.get(options, (res) => {
      const duration = Date.now() - startTime;
      console.log(`✅ Direct IP (NO SNI): SUCCESS`);
      console.log(`   Status: ${res.statusCode}, Duration: ${duration}ms`);
      console.log('   🎯 SNI FILTERING CONFIRMED!');
      res.on('data', () => {});
      res.on('end', () => resolve(true));
    });

    req.on('error', (err: any) => {
      const duration = Date.now() - startTime;
      console.log(`❌ Direct IP (NO SNI): FAILED`);
      console.log(`   Error: ${err.code} - ${err.message}`);
      console.log(`   Duration: ${duration}ms`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ Direct IP (NO SNI): TIMEOUT`);
      req.destroy();
      resolve(false);
    });
  });
}

// Test 6: Compare curl behavior
async function compareCurl() {
  console.log('\n6️⃣  Curl Comparison');
  console.log('-'.repeat(70));

  try {
    // Test curl with verbose output
    const { stdout, stderr } = await execAsync(
      `curl -v -4 --max-time 5 "https://${HOST}${PATH}" 2>&1 | grep -E "(Trying|Connected|Server certificate|issuer)"`,
      { encoding: 'utf8' }
    );

    console.log('✅ Curl details:');
    console.log(stdout.split('\n').map(line => `   ${line}`).join('\n'));
  } catch (err: any) {
    console.log(`❌ Curl failed: ${err.message}`);
  }
}

// Test 7: Check NODE_DEBUG output
async function testWithDebug() {
  console.log('\n7️⃣  Node.js TLS Debug Info');
  console.log('-'.repeat(70));
  console.log('   Testing with NODE_DEBUG=https...');

  try {
    const { stdout, stderr } = await execAsync(
      `NODE_DEBUG=https node -e "require('https').get('https://${HOST}${PATH}', res => console.log('Status:', res.statusCode)).on('error', err => console.error('Error:', err.code));" 2>&1 | head -20`,
      { encoding: 'utf8', timeout: 15000 }
    );

    if (stderr.includes('HTTPS') || stdout.includes('HTTPS')) {
      console.log('   Debug output (first 20 lines):');
      console.log((stderr + stdout).split('\n').slice(0, 20).map(line => `   ${line}`).join('\n'));
    }
  } catch (err: any) {
    console.log(`   ⏱️  Timed out or failed (expected if connection blocked)`);
  }
}

// Main diagnostic
async function runDiagnostics() {
  const dnsResult = await testDNSResolution();

  const ipv4Works = await testForceIPv4();
  const ipv6Works = await testForceIPv6();

  if (dnsResult?.address) {
    const directIPWorks = await testDirectIP(dnsResult.address);
    const directIPNoSNIWorks = await testDirectIPNoSNI(dnsResult.address);

    // Diagnosis logic
    console.log('\n' + '='.repeat(70));
    console.log('🎯 DIAGNOSIS');
    console.log('='.repeat(70));

    if (!ipv4Works && !ipv6Works && directIPNoSNIWorks) {
      console.log('\n📌 CONFIRMED: SNI-based hostname filtering');
      console.log('   The firewall/ISP is inspecting the SNI field in TLS ClientHello');
      console.log('   and blocking connections to "api.telegram.org"');
      console.log('\n   Solution: Use direct IP with custom https.Agent (no SNI)');
    } else if (!ipv4Works && ipv6Works) {
      console.log('\n📌 CONFIRMED: IPv4-only blocking');
      console.log('   Use NODE_OPTIONS="--dns-result-order=ipv6first"');
    } else if (ipv4Works && !ipv6Works) {
      console.log('\n📌 CONFIRMED: IPv6 connectivity issue');
      console.log('   Use NODE_OPTIONS="--dns-result-order=ipv4first"');
    } else if (!ipv4Works && !ipv6Works && !directIPNoSNIWorks) {
      console.log('\n📌 CONFIRMED: Complete network block');
      console.log('   All connection methods blocked (IP-level or firewall)');
      console.log('   Solution: VPN or continue using curl workaround');
    } else {
      console.log('\n❓ Mixed results - check logs above for details');
    }
  }

  await compareCurl();
  await testWithDebug();

  console.log('\n' + '='.repeat(70));
  console.log('✅ Diagnostic Complete');
  console.log('='.repeat(70) + '\n');
}

// Run
runDiagnostics().catch(console.error);
