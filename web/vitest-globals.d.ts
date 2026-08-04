/**
 * vitest의 describe/it/expect 전역 타입.
 *
 * 예전에는 `@types/jest`로 때웠는데, 실제 러너가 없어서 그 파일들은 **타입만 맞고
 * 실행은 안 되는 상태**였다. vitest 도입(#41 Phase 3)으로 진짜 실행되므로
 * 타입도 실제 러너의 것으로 맞춘다.
 */
/// <reference types="vitest/globals" />
