import { NestFactory } from '@nestjs/core';
import { SeedModule } from '../seed.module';
import { CandidateSeedService } from './candidate-seed.service';

const run = async () => {
  const app = await NestFactory.createApplicationContext(SeedModule);
  const candidateSeeder = app.get(CandidateSeedService);

  const result = await candidateSeeder.clean();

  console.log(`\n🧹 Candidate cleanup finished: ${result.deletedCount} test registrations deleted.`);
  await app.close();
};

void run();
