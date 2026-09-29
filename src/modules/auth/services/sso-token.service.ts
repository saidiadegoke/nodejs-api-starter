import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { SignJWT, importPKCS8, KeyLike } from 'jose';
import { getSsoConfig } from '../../../shared/config/sso-keys.config';
import { DataSource } from 'typeorm';

let cachedPrivateKey: KeyLike | Uint8Array | null = null;
let cachedKid: string | null = null;

@Injectable()
export class SsoTokenService {
  constructor(private readonly dataSource: DataSource) {}

  private async getSigningMaterial(): Promise<{ privateKey: KeyLike | Uint8Array; kid: string }> {
    const { privateKeyPem, currentKid, enabled } = getSsoConfig();
    if (!enabled) {
      throw new Error('SSO issuer is not configured');
    }

    if (!cachedPrivateKey || cachedKid !== currentKid) {
      cachedPrivateKey = await importPKCS8(privateKeyPem, 'RS256');
      cachedKid = currentKid;
    }

    return { privateKey: cachedPrivateKey, kid: currentKid };
  }

  resetPrivateKeyCacheForTests(): void {
    cachedPrivateKey = null;
    cachedKid = null;
  }

  buildHandoffClaims(user: any): Record<string, any> {
    if (!user || !user.id) {
      throw new Error('User record required for SSO handoff');
    }
    if (!user.email) {
      throw new Error('User email is required for SSO handoff');
    }

    const institutionId = user.jupeb_university_id || null;
    const institutionCode = user.jupeb_university_code || null;
    const institutionShortCode = user.jupeb_university_short_name || null;

    return {
      sub: String(user.id),
      email: user.email,
      roles: Array.isArray(user.roles) ? user.roles : [],
      institution_id: institutionId ? String(institutionId) : null,
      institution_code: institutionCode ? String(institutionCode) : null,
      institution_short_code: institutionShortCode ? String(institutionShortCode) : null,
    };
  }

  async issueHandoffToken({ user, targetApp }: { user: any; targetApp: string }): Promise<string> {
    const { issuer } = getSsoConfig();
    const { privateKey, kid } = await this.getSigningMaterial();

    let enrichedUser = { ...user };
    const hasUniCode = enrichedUser?.jupeb_university_code;
    const hasUniShortCode = enrichedUser?.jupeb_university_short_name;

    if ((!hasUniCode || !hasUniShortCode) && enrichedUser?.jupeb_university_id) {
      try {
        const rows = await this.dataSource.query(
          `SELECT code, short_name FROM jupeb_universities WHERE id = $1 LIMIT 1`,
          [enrichedUser.jupeb_university_id]
        );
        const uni = rows[0];
        if (uni) {
          enrichedUser = {
            ...enrichedUser,
            jupeb_university_code: uni.code,
            jupeb_university_short_name: uni.short_name,
          };
        }
      } catch {
        // Non-fatal fallback
      }
    }

    const claims = this.buildHandoffClaims(enrichedUser);

    const token = await new SignJWT({
      email: claims.email,
      roles: claims.roles,
      institution_id: claims.institution_id,
      institution_code: claims.institution_code,
      institution_short_code: claims.institution_short_code,
      short_code: claims.institution_short_code,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(claims.sub)
      .setIssuer(issuer)
      .setAudience(targetApp)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

    return token;
  }
}
