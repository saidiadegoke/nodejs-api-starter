import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { BypassEnvelope } from './utils/decorators/bypass-envelope.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  @Get('health')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Health check probe', description: 'Returns system uptime, timestamp, and environment status.' })
  @ApiOkResponse({ description: 'API health status' })
  getHealth() {
    return {
      success: true,
      message: 'API is running',
      appType: "NestJS is here",
      version: "0.0.6",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Get()
  @BypassEnvelope()
  @ApiOperation({ summary: 'System runtime info & route directory', description: 'Lists all available API modules and endpoints.' })
  @ApiOkResponse({ description: 'API runtime and route manifest' })
  getInfo() {
    return {
      success: true,
      message: 'API v1.0',
      version: '1.0.0',
      documentation: {
        index: '/docs',
        auth: '/docs/auth',
        users: '/docs/users',
        files: '/docs/files',
        notifications: '/docs/notifications',
        assets: '/docs/assets',
        shared: '/docs/shared',
        websocket: '/docs/websocket',
        admin: '/docs/admin',
        apiKeys: '/docs/api-keys',
        webhooks: '/docs/webhooks',
        payments: '/docs/payments',
        posts: '/docs/posts',
        jupeb001Catalog: '/docs/jupeb-001-catalog',
        jupeb002Sessions: '/docs/jupeb-002-sessions',
        jupeb003Identity: '/docs/jupeb-003-identity',
        jupeb004Submission: '/docs/jupeb-004-submission',
        jupeb005Registration: '/docs/jupeb-005-registration',
        jupeb006Finance: '/docs/jupeb-006-finance',
        jupeb007Academic: '/docs/jupeb-007-academic',
        jupeb008Dashboard: '/docs/jupeb-008-dashboard',
        jupeb009InstitutionScope: '/docs/jupeb-009-institution-scope',
        ocr: '/docs/ocr',
        sso: '/docs/sso',
        attendanceUpstream: '/docs/attendance-upstream',
        crmsUpstream: '/docs/crms-upstream',
      },
      endpoints: {
        auth: '/auth',
        users: '/users',
        files: '/files',
        notifications: '/notifications',
        websocket: '/websocket',
        assets: '/assets',
        shared: '/shared',
        admin: '/admin',
        apiKeys: '/api-keys',
        webhooks: '/webhooks',
        payments: '/payments',
        posts: '/posts',
        ocr: '/ocr',
        catalog: '/catalog',
        sessions: '/sessions',
        identity: '/identity',
        submission: '/submission',
        registration: '/registration',
        finance: '/finance',
        academic: '/academic',
        dashboard: '/dashboard',
        attendance: '/attendance',
        support: '/support',
        audit: '/audit',
        sso: '/sso',
        jwks: '/.well-known/jwks.json',
        health: '/health',
      },
      features: {
        authentication: 'JWT (access + refresh tokens)',
        authorization: 'RBAC (multiple roles per user)',
        file_storage: 'Centralized with multi-provider support',
        real_time: 'WebSocket support enabled',
        payments: 'Paystack, Flutterwave, direct bank transfer, webhooks',
        posts: 'User-authored posts with draft / published workflow',
        sso: 'RS256 handoff tokens for CRMS / Attendance (JWKS issuer)',
      },
    };
  }
}
