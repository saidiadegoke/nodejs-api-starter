import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ApplyNinResult {
  applied: {
    profile: boolean;
    next_of_kin: boolean;
  };
}

@Injectable()
export class NinWriteThroughService {
  constructor(private readonly dataSource: DataSource) {}

  async applyNinPayloadToRegistration(params: {
    registrationId: string;
    ninPayload?: Record<string, any> | null;
    userId?: string | null;
  }): Promise<ApplyNinResult> {
    const { registrationId, ninPayload, userId } = params;
    if (!registrationId) return { applied: { profile: false, next_of_kin: false } };
    const payload = ninPayload || {};

    const result = { applied: { profile: false, next_of_kin: false } };

    try {
      const regRows = await this.dataSource.query(
        `SELECT user_id FROM jupeb_registrations WHERE id = $1`,
        [registrationId],
      );
      const reg = regRows[0];

      const firstName = payload.first_name != null && String(payload.first_name).trim() !== ''
        ? String(payload.first_name).trim()
        : null;
      const lastName = payload.last_name != null && String(payload.last_name).trim() !== ''
        ? String(payload.last_name).trim()
        : null;
      const displayFromNames = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
      const displayName = (payload.display_name != null && String(payload.display_name).trim() !== '')
        ? String(payload.display_name).trim()
        : displayFromNames;

      // 1) Profile: demographics + address — only fill when empty (never overwrite edits).
      if (reg && reg.user_id) {
        const profileFields: Record<string, any> = {
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          display_name: displayName || undefined,
          residential_address: payload.address || payload.residential_address,
          state_of_origin: payload.state_of_origin,
          lga: payload.lga,
          place_of_birth: payload.place_of_birth,
          gender: payload.gender != null && String(payload.gender).trim() !== ''
            ? String(payload.gender).trim()
            : undefined,
          profile_photo_url: payload.photo_url != null && String(payload.photo_url).trim() !== ''
            ? String(payload.photo_url).trim()
            : undefined,
        };

        const present = Object.entries(profileFields).filter(
          ([, v]) => v !== undefined && v !== null && String(v).trim() !== '',
        );

        if (present.length) {
          await this.dataSource.query(
            `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
            [reg.user_id],
          );
          const sets = present.map(([k], idx) => `${k} = COALESCE(NULLIF(${k}, ''), $${idx + 2})`).join(', ');
          const values = present.map(([, v]) => String(v));
          const upd = await this.dataSource.query(
            `UPDATE profiles SET ${sets}, updated_at = NOW() WHERE user_id = $1 RETURNING user_id`,
            [reg.user_id, ...values],
          );
          if (upd && upd.length > 0) result.applied.profile = true;
        }

        const dobRaw = payload.date_of_birth;
        if (dobRaw != null && String(dobRaw).trim() !== '') {
          await this.dataSource.query(
            `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
            [reg.user_id],
          );
          const dobUpd = await this.dataSource.query(
            `UPDATE profiles
                SET date_of_birth = COALESCE(date_of_birth, $2::date), updated_at = NOW()
              WHERE user_id = $1`,
            [reg.user_id, String(dobRaw).trim()],
          );
          if (dobUpd && dobUpd.length > 0) result.applied.profile = true;
        }
      }

      // 2) Next-of-kin: insert when no active row exists, with source='nin'.
      const nok = payload.next_of_kin;
      if (nok && typeof nok === 'object') {
        const existingNok = await this.dataSource.query(
          `SELECT id FROM jupeb_next_of_kin WHERE registration_id = $1 LIMIT 1`,
          [registrationId],
        );
        if (!existingNok || !existingNok.length) {
          const nameRaw = nok.name || nok.full_name || [nok.first_name, nok.middle_name, nok.last_name]
            .filter((x: any) => x && String(x).trim())
            .map((x: any) => String(x).trim())
            .join(' ');
          const name = nameRaw ? String(nameRaw).trim() : '';
          const relationshipRaw = nok.relationship || nok.relation || 'relative';
          const relationship = String(relationshipRaw).toLowerCase();
          const phoneRaw = nok.phone || nok.contact || nok.contact_no;
          const phone = phoneRaw != null && String(phoneRaw).trim() !== '' ? String(phoneRaw).trim() : null;
          const email = nok.email != null && String(nok.email).trim() !== '' ? String(nok.email).trim() : null;
          const address = nok.address != null && String(nok.address).trim() !== '' ? String(nok.address).trim() : null;

          if (name) {
            try {
              await this.dataSource.query(
                `INSERT INTO jupeb_next_of_kin (
                  registration_id, name, relationship, phone, email, address, source, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, 'nin', $7)`,
                [registrationId, name, relationship, phone, email, address, userId || null],
              );
              result.applied.next_of_kin = true;
            } catch {
              // Swallow constraint issues gracefully
            }
          }
        }
      }
    } catch {
      // Non-fatal write-through error
    }

    return result;
  }
}
