import { Module } from '@nestjs/common';
import { LootBoxesController } from './loot-boxes.controller';
import { LootBoxesService } from './loot-boxes.service';

@Module({ controllers: [LootBoxesController], providers: [LootBoxesService] })
export class LootBoxesModule {}
