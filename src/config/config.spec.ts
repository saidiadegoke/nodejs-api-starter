import { validateConfig } from './validate-config';
import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { jwtConfig } from './jwt.config';
import { fileStorageConfig } from './file-storage.config';
import { redisConfig } from './redis.config';
import { mailConfig } from './mail.config';
import { integrationsConfig } from './integrations.config';
import { IsNotEmpty, IsString } from 'class-validator';

class RequiredTestValidator {
  @IsNotEmpty()
  @IsString()
  REQUIRED_KEY!: string;
}

describe('Configuration System', () => {
  describe('validateConfig', () => {
    it('should pass validation when required variables are present', () => {
      const result = validateConfig({ REQUIRED_KEY: 'test-value' }, RequiredTestValidator);
      expect(result.REQUIRED_KEY).toBe('test-value');
    });

    it('should throw an error with clear formatting when validation fails', () => {
      expect(() => {
        validateConfig({}, RequiredTestValidator);
      }).toThrow('Configuration validation failed on application startup');
    });
  });

  describe('Config Modules', () => {
    it('should load appConfig without errors', () => {
      const config = appConfig();
      expect(config).toBeDefined();
      expect(config.nodeEnv).toBeDefined();
    });

    it('should load databaseConfig without errors', () => {
      const config = databaseConfig();
      expect(config).toBeDefined();
      expect(config.port).toBeDefined();
    });

    it('should load jwtConfig without errors', () => {
      const config = jwtConfig();
      expect(config).toBeDefined();
      expect(config.secret).toBeDefined();
    });

    it('should load fileStorageConfig without errors', () => {
      const config = fileStorageConfig();
      expect(config).toBeDefined();
      expect(config.defaultProvider).toBeDefined();
    });

    it('should load redisConfig without errors', () => {
      const config = redisConfig();
      expect(config).toBeDefined();
      expect(config.url).toBeDefined();
    });

    it('should load mailConfig without errors', () => {
      const config = mailConfig();
      expect(config).toBeDefined();
    });

    it('should load integrationsConfig without errors', () => {
      const config = integrationsConfig();
      expect(config).toBeDefined();
      expect(config.speedysms).toBeDefined();
      expect(config.attendance).toBeDefined();
      expect(config.crms).toBeDefined();
      expect(config.paystack).toBeDefined();
      expect(config.sso).toBeDefined();
    });
  });
});
