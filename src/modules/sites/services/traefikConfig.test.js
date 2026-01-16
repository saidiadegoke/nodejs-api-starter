/**
 * Traefik Config Service Test
 * Tests write permissions and config generation
 */

const TraefikConfigService = require('./traefikConfig.service');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../../shared/utils/logger');

class TraefikConfigTest {
  /**
   * Test write permissions to Traefik config directory
   */
  static async testWritePermissions() {
    const configDir = TraefikConfigService.getTraefikConfigDir();
    const testFile = path.join(configDir, '.traefik-write-test');

    try {
      // Ensure directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Try to write a test file
      const testContent = `# Traefik write test - ${new Date().toISOString()}\n# This file can be safely deleted\n`;
      await fs.writeFile(testFile, testContent, 'utf8');

      // Verify file was written
      const stats = await fs.stat(testFile);
      if (stats.isFile()) {
        logger.info(`✓ Write test successful: ${testFile}`);
        
        // Clean up test file
        await fs.unlink(testFile);
        
        return {
          success: true,
          message: `Write permissions OK: ${configDir}`,
          directory: configDir,
        };
      } else {
        throw new Error('Test file was not created');
      }
    } catch (error) {
      logger.error(`✗ Write test failed: ${error.message}`);
      return {
        success: false,
        message: `Write permissions failed: ${error.message}`,
        directory: configDir,
        error: error.message,
      };
    }
  }

  /**
   * Test config file generation
   */
  static async testConfigGeneration() {
    const testDomain = {
      id: 999,
      domain: 'test-example-com',
      site_id: 1,
      verified: true,
      certificate_id: null,
      ssl_status: 'pending',
    };

    const testSite = {
      id: 1,
      slug: 'test-site',
      name: 'Test Site',
    };

    try {
      const config = await TraefikConfigService.generateDomainConfig(testDomain, testSite);
      
      // Validate config structure
      if (!config.http || !config.http.routers || !config.http.services) {
        throw new Error('Invalid config structure');
      }

      logger.info('✓ Config generation test successful');
      
      return {
        success: true,
        message: 'Config generation works correctly',
        config: config,
      };
    } catch (error) {
      logger.error(`✗ Config generation test failed: ${error.message}`);
      return {
        success: false,
        message: `Config generation failed: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Run all tests
   */
  static async runAllTests() {
    logger.info('=== Traefik Config Service Tests ===');
    
    const results = {
      writePermissions: null,
      configGeneration: null,
    };

    // Test 1: Write permissions
    logger.info('\n1. Testing write permissions...');
    results.writePermissions = await this.testWritePermissions();

    // Test 2: Config generation
    logger.info('\n2. Testing config generation...');
    results.configGeneration = await this.testConfigGeneration();

    // Summary
    logger.info('\n=== Test Summary ===');
    logger.info(`Write Permissions: ${results.writePermissions.success ? '✓ PASS' : '✗ FAIL'}`);
    logger.info(`Config Generation: ${results.configGeneration.success ? '✓ PASS' : '✗ FAIL'}`);

    const allPassed = results.writePermissions.success && results.configGeneration.success;
    
    if (!allPassed) {
      logger.error('\n✗ Some tests failed. Please check the errors above.');
      if (!results.writePermissions.success) {
        logger.error(`\nFix write permissions:`);
        logger.error(`  sudo mkdir -p ${results.writePermissions.directory}`);
        logger.error(`  sudo chown -R $(whoami):docker ${results.writePermissions.directory}`);
        logger.error(`  sudo chmod -R 775 ${results.writePermissions.directory}`);
      }
    } else {
      logger.info('\n✓ All tests passed!');
    }

    return results;
  }
}

// If run directly
if (require.main === module) {
  TraefikConfigTest.runAllTests()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = TraefikConfigTest;

