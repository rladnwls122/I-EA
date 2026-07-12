import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { AdminPurchasesController } from './admin-purchases.controller';
import { AdminPurchasesService } from './admin-purchases.service';

@Module({
  controllers: [ShopController, AdminPurchasesController],
  providers: [ShopService, AdminPurchasesService],
})
export class ShopModule {}
