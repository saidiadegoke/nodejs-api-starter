export interface AppConfig {
  nodeEnv: string;
  name: string;
  port: number;
  apiPrefix: string;
  apiBaseUrl: string;
  frontendUrl?: string;
  institutionFrontendUrl?: string;
  corsOrigin: string[] | boolean | string;
  logFormat: string;
  logLevel: string;
  logDir: string;
  logDebug: boolean;
  apiDocsPassword?: string;
  rateLimitEnabled: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface DatabaseConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  name?: string;
  url?: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface FileStorageConfig {
  defaultProvider: 'mock' | 'local' | 's3';
  s3Provider: 'aws' | 'digitalocean';
  storageLimitMb: number;
  doSpaces: {
    accessKey?: string;
    secret?: string;
    region?: string;
    endpoint?: string;
    bucket?: string;
  };
  aws: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    bucket?: string;
    baseUrl?: string;
  };
}

export interface RedisConfig {
  url: string;
  redisHost: string;
  host: string;
  port: number;
  password?: string;
  username?: string;
  isTls: boolean;
  rejectUnauthorized: boolean;
}

export interface MailConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  fromEmail?: string;
}

export interface IntegrationsConfig {
  speedysms: {
    apiKey?: string;
    baseUrl?: string;
    ninTimeoutMs: number;
    smsTimeoutMs: number;
    senderId?: string;
  };
  attendance: {
    baseUrl?: string;
    applicationName?: string;
    adminSecret?: string;
    mockStudents: boolean;
  };
  crms: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs: number;
  };
  paystack: {
    secretKey?: string;
    publicKey?: string;
  };
  sso: {
    issuer?: string;
    currentKid?: string;
    privateKeyPem?: string;
    jwksJson?: string;
  };
  jupeb: {
    ninProvider: string;
    ninRetryAfterSeconds: number;
    institutionCodeTtlHours: number;
    studentRoutesStrict: boolean;
  };
  otp: {
    channel: string;
    ttlMinutes: number;
    smsProvider: string;
  };
  oauth: {
    google: { clientId?: string; clientSecret?: string };
    facebook: { appId?: string; appSecret?: string };
    github: { clientId?: string; clientSecret?: string };
    twitter: { consumerKey?: string; consumerSecret?: string };
  };
}

export interface AllConfigType {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  fileStorage: FileStorageConfig;
  redis: RedisConfig;
  mail: MailConfig;
  integrations: IntegrationsConfig;
}
