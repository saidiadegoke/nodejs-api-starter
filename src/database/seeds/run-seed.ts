import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { UserSeedService } from './user/user-seed.service';
import { RbacSeedService } from './rbac/rbac-seed.service';
import { JupebSeedService } from './jupeb/jupeb-seed.service';

const runSeed = async () => {
  const app = await NestFactory.createApplicationContext(SeedModule);

  await app.get(UserSeedService).run();
  await app.get(RbacSeedService).run();
  await app.get(JupebSeedService).run();

  await app.close();
};

void runSeed();
