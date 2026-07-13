import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleType } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { AdminPurchasesService } from './admin-purchases.service';
import { FulfillDto } from './dto/fulfill.dto';
import { ListPurchasesDto } from './dto/list-purchases.dto';

/** 실물 쿠폰(PHYSICAL) 구매 배송 처리. ADMIN 전용. */
@ApiTags('admin-purchases')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('admin/purchases')
export class AdminPurchasesController {
  constructor(private readonly service: AdminPurchasesService) {}

  @Get()
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '구매 목록(기본 PENDING) — 실물 쿠폰 배송용' })
  list(@Query() query: ListPurchasesDto) {
    return this.service.listPending(query.status ?? 'PENDING');
  }

  @Patch(':id/fulfill')
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '구매 배송 완료 처리' })
  fulfill(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FulfillDto) {
    return this.service.fulfill(id, dto.note);
  }
}
