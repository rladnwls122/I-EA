import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import type { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { ShopService } from './shop.service';
import { PurchaseDto } from './dto/purchase.dto';

@ApiTags('shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly service: ShopService) {}

  @Get('items')
  @Public()
  @ApiOperation({ summary: '상점 카탈로그' })
  items() {
    return this.service.listItems();
  }

  @Post('purchase')
  @ApiBearerAuth()
  @ApiOperation({ summary: '아이템 구매' })
  purchase(@CurrentUser() user: CurrentUserPayload, @Body() dto: PurchaseDto) {
    return this.service.purchase(user.id, dto.itemKey);
  }
}
