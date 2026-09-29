export interface AppConfig {
  nodeEnv: string;
  name: string;
  port: number;
  apiPrefix: string;
  corsOrigin: string[] | boolean | string;
  logFormat: string;
  logLevel: string;
  logDir: string;
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

export interface AllConfigType {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
}
