import { NestFactory } from '@nestjs/core';
import { SeedModule } from '../seed.module';
import { CandidateSeedService } from './candidate-seed.service';

const run = async () => {
  const app = await NestFactory.createApplicationContext(SeedModule);
  const candidateSeeder = app.get(CandidateSeedService);

  const count = parseInt(process.env.COUNT || '10', 10);
  const result = await candidateSeeder.run(count);

  console.log(`\n🎉 Candidate seeding finished: ${result.createdCount} candidates in session ${result.sessionId}`);
  await app.close();
};

void run();
