import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SHOP_ITEMS } from '@/common/constants/shop';

const KEYS = Object.keys(SHOP_ITEMS);

export class PurchaseDto {
  @ApiProperty({ enum: KEYS, description: '구매할 상품 키' })
  @IsIn(KEYS)
  itemKey!: string;
}
