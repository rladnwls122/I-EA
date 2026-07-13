import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListPurchasesDto } from './list-purchases.dto';

/** 전역 ValidationPipe와 동일한 규칙(whitelist/forbidNonWhitelisted)으로 검증. */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListPurchasesDto, payload);
  return validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

// FIX 6: status 쿼리가 검증 없이 Prisma where로 새어들어가 잘못된 값에 500이 나는 것을 막는다.
describe('ListPurchasesDto', () => {
  it('status 생략은 통과한다(기본 PENDING은 컨트롤러가 채운다)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('PENDING/FULFILLED는 통과한다', () => {
    expect(validate({ status: 'PENDING' })).toHaveLength(0);
    expect(validate({ status: 'FULFILLED' })).toHaveLength(0);
  });

  it('허용되지 않은 status 값은 거부한다', () => {
    expect(validate({ status: 'DROP TABLE purchases;' }).length).toBeGreaterThan(0);
    expect(validate({ status: 'pending' }).length).toBeGreaterThan(0); // 대소문자도 정확히 일치해야
  });
});
