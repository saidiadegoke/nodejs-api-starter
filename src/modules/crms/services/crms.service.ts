import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolveStudentContext } from '../../../integrations/student-context';
import * as crmsProvider from '../../../integrations/crms';

@Injectable()
export class CrmsService {
  private readonly logger = new Logger(CrmsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getHomeSummary(userId: string) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = crmsProvider.get();
    return provider.getHomeSummary(ctx);
  }

  async getCourses(userId: string) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = crmsProvider.get();
    return provider.getCourses(ctx);
  }

  async getResults(userId: string) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = crmsProvider.get();
    return provider.getResults(ctx);
  }

  async syncCandidates(payload: any) {
    const provider = crmsProvider.get();
    return provider.syncCandidates(payload);
  }

  async syncInstitutions(payload: any) {
    const provider = crmsProvider.get();
    return provider.syncInstitutions(payload);
  }
}
