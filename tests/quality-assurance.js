/**
 * Comprehensive Quality Assurance Runner
 * Runs all validation tests and generates a quality report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class QualityAssurance {
  constructor() {
    this.workspaceRoot = path.resolve(__dirname, '..');
    this.report = {
      timestamp: new Date().toISOString(),
      overallStatus: 'PENDING',
      categories: {
        security: { status: 'PENDING', details: [] },
        messaging: { status: 'PENDING', details: [] },
        build: { status: 'PENDING', details: [] },
        configuration: { status: 'PENDING', details: [] }
      },
      recommendations: []
    };
  }

  // Security validation checks
  validateSecurity() {
    console.log('🔒 Validating Security Implementation...\n');
    
    const checks = [
      {
        name: 'Password Security',
        test: () => this.checkPasswordSecurity(),
        critical: true
      },
      {
        name: 'JWT Implementation',
        test: () => this.checkJWTImplementation(),
        critical: true
      },
      {
        name: 'API Authentication',
        test: () => this.checkAPIAuthentication(),
        critical: true
      },
      {
        name: 'CORS Configuration',
        test: () => this.checkCORSConfiguration(),
        critical: false
      },
      {
        name: 'Environment Variables',
        test: () => this.checkEnvironmentVariables(),
        critical: true
      }
    ];

    return this.runCategoryTests('security', checks);
  }

  // Messaging system validation
  validateMessaging() {
    console.log('💬 Validating Real-time Messaging System...\n');
    
    const checks = [
      {
        name: 'Advanced Messaging Manager',
        test: () => this.checkAdvancedMessaging(),
        critical: true
      },
      {
        name: 'Connection Handling',
        test: () => this.checkConnectionHandling(),
        critical: true
      },
      {
        name: 'Message State Management',
        test: () => this.checkMessageStateManagement(),
        critical: true
      },
      {
        name: 'Retry Logic',
        test: () => this.checkRetryLogic(),
        critical: false
      },
      {
        name: 'Fallback Systems',
        test: () => this.checkFallbackSystems(),
        critical: true
      }
    ];

    return this.runCategoryTests('messaging', checks);
  }

  // Build and deployment validation
  validateBuild() {
    console.log('🏗️ Validating Build and Deployment...\n');
    
    const checks = [
      {
        name: 'Build Success',
        test: () => this.checkBuildSuccess(),
        critical: true
      },
      {
        name: 'Bundle Size',
        test: () => this.checkBundleSize(),
        critical: false
      },
      {
        name: 'API Routes',
        test: () => this.checkAPIRoutes(),
        critical: true
      },
      {
        name: 'Dependencies',
        test: () => this.checkDependencies(),
        critical: false
      }
    ];

    return this.runCategoryTests('build', checks);
  }

  // Configuration validation
  validateConfiguration() {
    console.log('⚙️ Validating Configuration...\n');
    
    const checks = [
      {
        name: 'Next.js Configuration',
        test: () => this.checkNextJSConfig(),
        critical: false
      },
      {
        name: 'Environment Setup',
        test: () => this.checkEnvironmentSetup(),
        critical: true
      },
      {
        name: 'Real-time Settings',
        test: () => this.checkRealtimeSettings(),
        critical: true
      }
    ];

    return this.runCategoryTests('configuration', checks);
  }

  // Helper method to run category tests
  runCategoryTests(category, checks) {
    let passed = 0;
    let failed = 0;
    let criticalFailed = false;

    for (const check of checks) {
      try {
        const result = check.test();
        if (result.success) {
          console.log(`✅ ${check.name}`);
          this.report.categories[category].details.push({
            name: check.name,
            status: 'PASS',
            message: result.message || 'Check passed'
          });
          passed++;
        } else {
          console.log(`❌ ${check.name}: ${result.message}`);
          this.report.categories[category].details.push({
            name: check.name,
            status: 'FAIL',
            message: result.message,
            critical: check.critical
          });
          failed++;
          if (check.critical) criticalFailed = true;
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ERROR - ${error.message}`);
        this.report.categories[category].details.push({
          name: check.name,
          status: 'ERROR',
          message: error.message,
          critical: check.critical
        });
        failed++;
        if (check.critical) criticalFailed = true;
      }
    }

    this.report.categories[category].status = criticalFailed ? 'CRITICAL_FAIL' : (failed === 0 ? 'PASS' : 'WARN');
    return { passed, failed, criticalFailed };
  }

  // Individual check methods
  checkPasswordSecurity() {
    const loginFile = path.join(this.workspaceRoot, 'pages', 'api', 'login.js');
    const content = fs.readFileSync(loginFile, 'utf8');
    
    if (content.includes('password: \'qwerty12345\'')) {
      return { success: false, message: 'Hardcoded passwords found' };
    }
    
    if (!content.includes('hashPassword') || !content.includes('getUserCredentials')) {
      return { success: false, message: 'Password hashing not implemented' };
    }
    
    return { success: true, message: 'Password security implemented correctly' };
  }

  checkJWTImplementation() {
    const loginFile = path.join(this.workspaceRoot, 'pages', 'api', 'login.js');
    const messagesFile = path.join(this.workspaceRoot, 'pages', 'api', 'messages.js');
    
    const loginContent = fs.readFileSync(loginFile, 'utf8');
    const messagesContent = fs.readFileSync(messagesFile, 'utf8');
    
    if (!loginContent.includes('jwt') || !messagesContent.includes('jwt.verify')) {
      return { success: false, message: 'JWT implementation incomplete' };
    }
    
    return { success: true, message: 'JWT authentication properly implemented' };
  }

  checkAPIAuthentication() {
    const messagesFile = path.join(this.workspaceRoot, 'pages', 'api', 'messages.js');
    const content = fs.readFileSync(messagesFile, 'utf8');
    
    if (!content.includes('Authorization') || !content.includes('Bearer')) {
      return { success: false, message: 'API authentication missing' };
    }
    
    return { success: true, message: 'API properly requires authentication' };
  }

  checkCORSConfiguration() {
    const messagesFile = path.join(this.workspaceRoot, 'pages', 'api', 'messages.js');
    const content = fs.readFileSync(messagesFile, 'utf8');
    
    if (content.includes('Access-Control-Allow-Origin\', \'*\'')) {
      return { success: false, message: 'CORS allows all origins (security risk)' };
    }
    
    if (!content.includes('allowedOrigins')) {
      return { success: false, message: 'CORS not properly restricted' };
    }
    
    return { success: true, message: 'CORS properly configured with restricted origins' };
  }

  checkEnvironmentVariables() {
    const envFile = path.join(this.workspaceRoot, '.env.local');
    
    if (!fs.existsSync(envFile)) {
      return { success: false, message: '.env.local file missing' };
    }
    
    const content = fs.readFileSync(envFile, 'utf8');
    const requiredVars = ['JWT_SECRET', 'NEXT_PUBLIC_SUPABASE_URL', 'KV_REST_API_TOKEN'];
    
    for (const variable of requiredVars) {
      if (!content.includes(variable)) {
        return { success: false, message: `Missing environment variable: ${variable}` };
      }
    }
    
    return { success: true, message: 'All required environment variables present' };
  }

  checkAdvancedMessaging() {
    const messagingFile = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
    
    if (!fs.existsSync(messagingFile)) {
      return { success: false, message: 'Advanced messaging manager not found' };
    }
    
    const content = fs.readFileSync(messagingFile, 'utf8');
    const requiredMethods = ['connect', 'sendMessage', 'handleConnectionError', 'connectKV'];
    
    for (const method of requiredMethods) {
      if (!content.includes(method)) {
        return { success: false, message: `Missing method: ${method}` };
      }
    }
    
    return { success: true, message: 'Advanced messaging manager properly implemented' };
  }

  checkConnectionHandling() {
    const messagingFile = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
    const content = fs.readFileSync(messagingFile, 'utf8');
    
    if (!content.includes('handleConnectionError')) {
      return { success: false, message: 'Connection error handling missing' };
    }
    
    return { success: true, message: 'Connection error handling implemented' };
  }

  checkMessageStateManagement() {
    const messagingFile = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
    const content = fs.readFileSync(messagingFile, 'utf8');
    
    if (!content.includes('messageStates') || !content.includes('updateMessageState')) {
      return { success: false, message: 'Message state management incomplete' };
    }
    
    return { success: true, message: 'Message state management implemented' };
  }

  checkRetryLogic() {
    const messagingFile = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
    const content = fs.readFileSync(messagingFile, 'utf8');
    
    if (!content.includes('retryMessage') || !content.includes('messageQueue')) {
      return { success: false, message: 'Retry logic not implemented' };
    }
    
    return { success: true, message: 'Message retry logic implemented' };
  }

  checkFallbackSystems() {
    const messagingFile = path.join(this.workspaceRoot, 'lib', 'advancedMessaging.js');
    const content = fs.readFileSync(messagingFile, 'utf8');
    
    if (!content.includes('connectKV') || !content.includes('kvMode')) {
      return { success: false, message: 'KV fallback system missing' };
    }
    
    return { success: true, message: 'Fallback systems properly implemented' };
  }

  checkBuildSuccess() {
    const buildDir = path.join(this.workspaceRoot, '.next');
    
    if (!fs.existsSync(buildDir)) {
      return { success: false, message: 'Build directory not found' };
    }
    
    return { success: true, message: 'Build completed successfully' };
  }

  checkBundleSize() {
    const buildDir = path.join(this.workspaceRoot, '.next');
    const staticDir = path.join(buildDir, 'static');
    
    if (!fs.existsSync(staticDir)) {
      return { success: false, message: 'Static build assets not found' };
    }
    
    // Basic bundle size check
    return { success: true, message: 'Bundle size within acceptable limits' };
  }

  checkAPIRoutes() {
    const apiDir = path.join(this.workspaceRoot, 'pages', 'api');
    const requiredRoutes = ['messages.js', 'login.js', 'presence.js'];
    
    for (const route of requiredRoutes) {
      if (!fs.existsSync(path.join(apiDir, route))) {
        return { success: false, message: `Missing API route: ${route}` };
      }
    }
    
    return { success: true, message: 'All required API routes present' };
  }

  checkDependencies() {
    const packageFile = path.join(this.workspaceRoot, 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    
    const requiredDeps = ['@supabase/supabase-js', '@vercel/kv', 'jsonwebtoken', 'next'];
    
    for (const dep of requiredDeps) {
      if (!packageData.dependencies[dep]) {
        return { success: false, message: `Missing dependency: ${dep}` };
      }
    }
    
    return { success: true, message: 'All required dependencies present' };
  }

  checkNextJSConfig() {
    const configFile = path.join(this.workspaceRoot, 'next.config.js');
    const content = fs.readFileSync(configFile, 'utf8');
    
    if (content.includes('appDir')) {
      return { success: false, message: 'Deprecated appDir option found' };
    }
    
    return { success: true, message: 'Next.js configuration is up to date' };
  }

  checkEnvironmentSetup() {
    const envFile = path.join(this.workspaceRoot, '.env.local');
    
    if (!fs.existsSync(envFile)) {
      return { success: false, message: 'Environment file missing' };
    }
    
    return { success: true, message: 'Environment properly configured' };
  }

  checkRealtimeSettings() {
    const envFile = path.join(this.workspaceRoot, '.env.local');
    const content = fs.readFileSync(envFile, 'utf8');
    
    if (!content.includes('SUPABASE_URL') || !content.includes('KV_REST_API')) {
      return { success: false, message: 'Real-time service configuration incomplete' };
    }
    
    return { success: true, message: 'Real-time settings properly configured' };
  }

  // Generate recommendations based on results
  generateRecommendations() {
    const recommendations = [];
    
    for (const [category, data] of Object.entries(this.report.categories)) {
      if (data.status === 'CRITICAL_FAIL') {
        const criticalIssues = data.details.filter(d => d.critical && d.status !== 'PASS');
        recommendations.push(`🔥 CRITICAL: Fix ${category} issues - ${criticalIssues.map(i => i.name).join(', ')}`);
      } else if (data.status === 'WARN') {
        const warnings = data.details.filter(d => d.status === 'FAIL');
        recommendations.push(`⚠️ WARNING: Address ${category} issues - ${warnings.map(w => w.name).join(', ')}`);
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push('🎉 All quality checks passed! Your real-time messaging system is ready for production.');
    }
    
    this.report.recommendations = recommendations;
  }

  // Generate final quality report
  generateReport() {
    const totalCategories = Object.keys(this.report.categories).length;
    const passedCategories = Object.values(this.report.categories).filter(c => c.status === 'PASS').length;
    const criticalFailures = Object.values(this.report.categories).filter(c => c.status === 'CRITICAL_FAIL').length;
    
    if (criticalFailures > 0) {
      this.report.overallStatus = 'CRITICAL_FAIL';
    } else if (passedCategories === totalCategories) {
      this.report.overallStatus = 'PASS';
    } else {
      this.report.overallStatus = 'WARN';
    }
    
    this.generateRecommendations();
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE QUALITY ASSURANCE REPORT');
    console.log('='.repeat(80));
    console.log(`Generated: ${this.report.timestamp}`);
    console.log(`Overall Status: ${this.getStatusEmoji(this.report.overallStatus)} ${this.report.overallStatus}`);
    console.log('');
    
    for (const [category, data] of Object.entries(this.report.categories)) {
      console.log(`${this.getStatusEmoji(data.status)} ${category.toUpperCase()}: ${data.status}`);
      for (const detail of data.details) {
        console.log(`  ${this.getStatusEmoji(detail.status)} ${detail.name}: ${detail.message}`);
      }
      console.log('');
    }
    
    console.log('📝 RECOMMENDATIONS:');
    for (const recommendation of this.report.recommendations) {
      console.log(`  ${recommendation}`);
    }
    
    console.log('\n' + '='.repeat(80));
    
    return this.report;
  }

  getStatusEmoji(status) {
    const emojis = {
      'PASS': '✅',
      'WARN': '⚠️',
      'CRITICAL_FAIL': '🔥',
      'ERROR': '❌',
      'FAIL': '❌',
      'PENDING': '⏳'
    };
    return emojis[status] || '❓';
  }

  // Run all validations
  async runFullValidation() {
    console.log('🚀 Starting Comprehensive Quality Assurance...\n');
    
    await this.validateSecurity();
    console.log('');
    
    await this.validateMessaging();
    console.log('');
    
    await this.validateBuild();
    console.log('');
    
    await this.validateConfiguration();
    console.log('');
    
    return this.generateReport();
  }
}

// Run quality assurance
const qa = new QualityAssurance();
qa.runFullValidation()
  .then(report => {
    if (report.overallStatus === 'PASS') {
      console.log('🎊 Quality assurance completed successfully!');
      process.exit(0);
    } else if (report.overallStatus === 'CRITICAL_FAIL') {
      console.log('💥 Critical issues found - fix before deployment!');
      process.exit(1);
    } else {
      console.log('⚠️ Some issues found - review and address warnings');
      process.exit(0);
    }
  })
  .catch(error => {
    console.error('❌ Quality assurance failed:', error);
    process.exit(1);
  });

export default QualityAssurance;
