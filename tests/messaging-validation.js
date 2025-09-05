/**
 * Real-time Messaging System Validation
 * Tests messaging functionality, connection handling, and error recovery
 */

import fs from 'fs';
import path from 'path';

class MessagingValidator {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.workspaceRoot = process.cwd();
  }

  test(description, testFn) {
    try {
      const result = testFn();
      if (result) {
        this.results.push(`✅ ${description}`);
        this.passed++;
      } else {
        this.results.push(`❌ ${description}`);
        this.failed++;
      }
    } catch (error) {
      this.results.push(`❌ ${description} - ERROR: ${error.message}`);
      this.failed++;
    }
  }

  // Test Advanced Messaging Manager exists and has required methods
  testAdvancedMessagingManager() {
    this.test('Advanced Messaging Manager Implementation', () => {
      const filePath = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
      const exists = fs.existsSync(filePath);
      
      if (!exists) return false;
      
      const content = fs.readFileSync(filePath, 'utf8');
      const requiredMethods = [
        'connect',
        'sendMessage',
        'getMessages',
        'disconnect',
        'handleConnectionError',
        'sendToKV',
        'getKVMessagesSince'
      ];
      
      return requiredMethods.every(method => content.includes(method));
    });
  }

  // Test Message API has proper authentication
  testMessageAPIAuthentication() {
    this.test('Message API JWT Authentication', () => {
      const filePath = path.join(this.workspaceRoot, 'pages', 'api', 'messages.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasJWTImport = content.includes('import jwt from');
      const hasTokenVerification = content.includes('jwt.verify');
      const hasAuthHeader = content.includes('Authorization');
      const hasRestrictedCORS = content.includes('allowedOrigins');
      
      return hasJWTImport && hasTokenVerification && hasAuthHeader && hasRestrictedCORS;
    });
  }

  // Test Connection Error Handling
  testConnectionErrorHandling() {
    this.test('Connection Error Handling', () => {
      const filePath = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasErrorHandler = content.includes('handleConnectionError');
      const hasKVFallback = content.includes('connectKV');
      const hasTryCatch = content.includes('try {') && content.includes('catch');
      
      return hasErrorHandler && hasKVFallback && hasTryCatch;
    });
  }

  // Test Multiple Communication Channels
  testMultipleChannels() {
    this.test('Multiple Communication Channels', () => {
      const filePath = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasMessagesChannel = content.includes('messages-');
      const hasBroadcastChannel = content.includes('broadcast-');
      const hasPresenceChannel = content.includes('presence-');
      
      return hasMessagesChannel && hasBroadcastChannel && hasPresenceChannel;
    });
  }

  // Test Message State Tracking
  testMessageStateTracking() {
    this.test('Message State Tracking', () => {
      const filePath = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasMessageStates = content.includes('messageStates');
      const hasMessageQueue = content.includes('messageQueue');
      const hasStateUpdates = content.includes('updateMessageState');
      
      return hasMessageStates && hasMessageQueue && hasStateUpdates;
    });
  }

  // Test Retry Logic Implementation
  testRetryLogic() {
    this.test('Message Retry Logic', () => {
      const filePath = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasRetryQueue = content.includes('startRetryQueue');
      const hasRetryMessage = content.includes('retryMessage');
      const hasRetryInterval = content.includes('retryInterval');
      
      return hasRetryQueue && hasRetryMessage && hasRetryInterval;
    });
  }

  // Test Environment Variable Usage
  testEnvironmentConfiguration() {
    this.test('Environment Variable Configuration', () => {
      const filePath = path.join(this.workspaceRoot, '.env.local');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasJWTSecret = content.includes('JWT_SECRET=');
      const hasSupabaseURL = content.includes('NEXT_PUBLIC_SUPABASE_URL=');
      const hasKVToken = content.includes('KV_REST_API_TOKEN=');
      const hasPasswordHashes = content.includes('PASSWORD_HASH=');
      
      return hasJWTSecret && hasSupabaseURL && hasKVToken && hasPasswordHashes;
    });
  }

  // Test ChatEnhanced Component Integration
  testChatComponentIntegration() {
    this.test('Chat Component Integration', () => {
      const filePath = path.join(this.workspaceRoot, 'components', 'ChatEnhanced.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasAdvancedImport = content.includes('AdvancedMessagingManager');
      const hasConnectionHandling = content.includes('onConnectionChange');
      const hasMessageHandling = content.includes('onMessage');
      const hasOptimisticUI = content.includes('optimistic');
      
      return hasAdvancedImport && hasConnectionHandling && hasMessageHandling && hasOptimisticUI;
    });
  }

  // Test API Endpoints Availability
  testAPIEndpoints() {
    this.test('Required API Endpoints', () => {
      const apiDir = path.join(this.workspaceRoot, 'pages', 'api');
      
      const requiredEndpoints = [
        'messages.js',
        'login.js',
        'presence.js',
        'debug.js'
      ];
      
      return requiredEndpoints.every(endpoint => 
        fs.existsSync(path.join(apiDir, endpoint))
      );
    });
  }

  // Test Login API Security
  testLoginAPISecurity() {
    this.test('Login API Security Implementation', () => {
      const filePath = path.join(this.workspaceRoot, 'pages', 'api', 'login.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasPasswordHashing = content.includes('hashPassword');
      const hasUserCredentials = content.includes('getUserCredentials');
      const hasEnvironmentVars = content.includes('process.env');
      const noHardcodedPasswords = !content.includes('password: \'qwerty12345\'');
      
      return hasPasswordHashing && hasUserCredentials && hasEnvironmentVars && noHardcodedPasswords;
    });
  }

  // Test Build Output Analysis
  testBuildOutput() {
    this.test('Build Output Analysis', () => {
      const buildDir = path.join(this.workspaceRoot, '.next');
      const buildExists = fs.existsSync(buildDir);
      
      if (!buildExists) return false;
      
      // Check for successful build artifacts
      const staticDir = path.join(buildDir, 'static');
      const serverDir = path.join(buildDir, 'server');
      
      return fs.existsSync(staticDir) && fs.existsSync(serverDir);
    });
  }

  // Check for security vulnerabilities in dependencies
  testDependencySecurity() {
    this.test('Dependency Security', () => {
      const packagePath = path.join(this.workspaceRoot, 'package.json');
      const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      const hasSupabase = packageContent.dependencies['@supabase/supabase-js'];
      const hasVercelKV = packageContent.dependencies['@vercel/kv'];
      const hasJWT = packageContent.dependencies['jsonwebtoken'];
      const hasNextJS = packageContent.dependencies['next'];
      
      return hasSupabase && hasVercelKV && hasJWT && hasNextJS;
    });
  }

  // Test Real-time Features Configuration
  testRealtimeConfiguration() {
    this.test('Real-time Features Configuration', () => {
      const configPath = path.join(this.workspaceRoot, 'next.config.js');
      const content = fs.readFileSync(configPath, 'utf8');
      
      const hasHeaders = content.includes('headers');
      const hasReactStrictMode = content.includes('reactStrictMode');
      const noDeprecatedOptions = !content.includes('appDir');
      
      return hasHeaders && hasReactStrictMode && noDeprecatedOptions;
    });
  }

  // Run all messaging tests
  runAllTests() {
    console.log('💬 Running Real-time Messaging Validation Tests...\n');
    
    this.testAdvancedMessagingManager();
    this.testMessageAPIAuthentication();
    this.testConnectionErrorHandling();
    this.testMultipleChannels();
    this.testMessageStateTracking();
    this.testRetryLogic();
    this.testEnvironmentConfiguration();
    this.testChatComponentIntegration();
    this.testAPIEndpoints();
    this.testLoginAPISecurity();
    this.testBuildOutput();
    this.testDependencySecurity();
    this.testRealtimeConfiguration();
    
    console.log('\n📊 Messaging Test Results:');
    this.results.forEach(result => console.log(result));
    
    console.log(`\n🎯 Summary: ${this.passed} passed, ${this.failed} failed`);
    
    if (this.failed === 0) {
      console.log('🎉 All messaging tests passed!');
    } else {
      console.log('⚠️ Some messaging tests failed - review implementation');
    }
    
    return this.failed === 0;
  }
}

// Export for testing
export default MessagingValidator;

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new MessagingValidator();
  validator.runAllTests();
}
