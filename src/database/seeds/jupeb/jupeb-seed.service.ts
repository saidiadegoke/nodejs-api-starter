import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentRequirementEntity } from '../../../modules/document-requirements/entities/document-requirement.entity';

interface DemoDocumentRequirement {
  key: string;
  title: string;
  description: string;
  isMandatory: boolean;
  allowedMimeTypes: string[];
  maxFileSizeMb: number;
}

const DEMO_REQUIREMENTS: DemoDocumentRequirement[] = [
  {
    key: 'PASSPORT',
    title: 'Passport Photograph',
    description: 'Recent passport photograph with clear background',
    isMandatory: true,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxFileSizeMb: 2,
  },
  {
    key: 'OLEVEL_1',
    title: 'OLevel Result (Primary Sitting)',
    description: 'WAEC/NECO/NABTEB statement of result or certificate',
    isMandatory: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxFileSizeMb: 5,
  },
  {
    key: 'BIRTH_CERT',
    title: 'Birth Certificate / Age Declaration',
    description: 'Official birth certificate or sworn declaration of age',
    isMandatory: false,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxFileSizeMb: 5,
  },
];

@Injectable()
export class JupebSeedService {
  private readonly logger = new Logger(JupebSeedService.name);

  constructor(
    @InjectRepository(DocumentRequirementEntity)
    private readonly docReqRepo: Repository<DocumentRequirementEntity>,
  ) {}

  async run(): Promise<void> {
    for (const reqDef of DEMO_REQUIREMENTS) {
      try {
        await this.upsertRequirement(reqDef);
      } catch (error) {
        this.logger.error(
          `Failed to seed document requirement ${reqDef.key}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async upsertRequirement(reqDef: DemoDocumentRequirement): Promise<void> {
    const existing = await this.docReqRepo.findOne({
      where: { key: reqDef.key },
    });

    if (!existing) {
      await this.docReqRepo.save(
        this.docReqRepo.create({
          key: reqDef.key,
          title: reqDef.title,
          description: reqDef.description,
          isMandatory: reqDef.isMandatory,
          allowedMimeTypes: reqDef.allowedMimeTypes,
          maxFileSizeMb: reqDef.maxFileSizeMb,
          status: 'active',
        }),
      );
      this.logger.log(`Created document requirement: ${reqDef.key}`);
    }
  }
}
