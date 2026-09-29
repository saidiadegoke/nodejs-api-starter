import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectEntity } from './entities/subject.entity';
import { SubjectCombinationEntity } from './entities/subject-combination.entity';
import { SubjectCombinationItemEntity } from './entities/subject-combination-item.entity';
import { SubjectRepository } from './repositories/subject.repository';
import { SubjectCombinationRepository } from './repositories/subject-combination.repository';
import { SubjectsService } from './services/subjects.service';
import { SubjectCombinationsService } from './services/subject-combinations.service';
import { SubjectsController } from './controllers/subjects.controller';
import { SubjectCombinationsController } from './controllers/subject-combinations.controller';
import { SharedModule } from '../../shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectEntity,
      SubjectCombinationEntity,
      SubjectCombinationItemEntity,
    ]),
    SharedModule,
  ],
  controllers: [SubjectsController, SubjectCombinationsController],
  providers: [
    SubjectRepository,
    SubjectCombinationRepository,
    SubjectsService,
    SubjectCombinationsService,
  ],
  exports: [
    SubjectRepository,
    SubjectCombinationRepository,
    SubjectsService,
    SubjectCombinationsService,
    TypeOrmModule,
  ],
})
export class SubjectsModule {}
