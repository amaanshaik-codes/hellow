#!/usr/bin/env node

// Quick validation script for socket server deployment
const jwt = require('jsonwebtoken');

console.log('🔍 Validating deployment configuration...\n');

// Check Node.js version
console.log(`📋 Node.js version: ${process.version}`);
console.log(`📋 Platform: ${process.platform} ${process.arch}`);
console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}\n`);

// Check required dependencies
const requiredDeps = ['express', 'socket.io', 'jsonwebtoken', 'cors'];
const missing = [];

requiredDeps.forEach(dep => {
  try {
    require(dep);
    console.log(`✅ ${dep}: Available`);
  } catch (e) {
    console.log(`❌ ${dep}: Missing`);
    missing.push(dep);
  }
});

if (missing.length > 0) {
  console.log(`\n❌ Missing dependencies: ${missing.join(', ')}`);
  process.exit(1);
}

// Check environment variables
console.log('\n🔐 Environment Variables:');
console.log(`PORT: ${process.env.PORT || 'Not set (will use 3001)'}`);
console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);

if (!process.env.JWT_SECRET) {
  console.log('\n❌ JWT_SECRET is required for authentication');
  console.log('💡 Set this in your Render dashboard under Environment Variables');
  process.exit(1);
}

// Test JWT functionality
console.log('\n🧪 Testing JWT functionality...');
try {
  const testPayload = { username: 'test', iat: Math.floor(Date.now() / 1000) };
  const token = jwt.sign(testPayload, process.env.JWT_SECRET);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log('✅ JWT signing and verification working');
} catch (e) {
  console.log('❌ JWT test failed:', e.message);
  process.exit(1);
}

console.log('\n🎉 All checks passed! Server should start successfully.');
console.log('🚀 Starting server in 2 seconds...\n');

setTimeout(() => {
  require('./index.js');
}, 2000);
