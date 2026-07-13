import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SHOP_ITEMS } from '@/common/constants/shop';

const KEYS = Object.keys(SHOP_ITEMS);

export class EquipCosmeticDto {
  @ApiProperty({ enum: KEYS, description: '장착할 꾸미기 아이템 키' })
  @IsIn(KEYS)
  itemKey!: string;
}
