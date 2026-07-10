# Q-Idea API 인벤토리 (MVP 기준)

- 작성일: 2026-07-08 (2026-07-09 최신 스펙 반영하여 갱신됨)
- 목적: 서비스 계층 리팩터링 착수 전, **이미 구현된 기능 vs 수정/신규/제거할 기능**을 확정한다.
- 범례: ✅ 그대로 유지 · 🔧 수정 필요 · 🆕 신규 구현 · ❌ 제거
- 큰 그림: **백엔드는 이미 대부분 구현되어 있다.** MVP 작업은 대부분 *수정·제거*이고, 일부 핵심 신규 엔드포인트(자기채점, 문제집, 주석)가 추가된다.

---

## 1. 핵심기능 ↔ 모듈 매핑

| MVP 핵심기능 | 담당 모듈 | 구현 상태 |
| --- | --- | --- |
| 로그인/회원가입 | auth | ✅ 완료 |
| 문제 출제 | questions, catalog, media, passages | 🔧 대부분 구현·수정 필요 |
| 문제 검색/조회 | questions | 🔧 필터 키 변경 (search_logs 제거) |
| 문제 풀이 + 모의고사 | exam-sessions | 🔧 + 🆕 자기채점 |
| 문제집(Workbook) | workbooks (신규) | 🆕 신규 모듈 (Pick & Mix) |
| 오답노트 2.0 | me, annotations(memos 개편) | 🔧+🆕 텍스트 주석 + 통계/메모 병합 |
| 문제 통계·평가 | reviews, questions | 🔧 🆕 정답률/시간 카운터 + 선지 분포 |
| 댓글/대댓글 | comments | 🔧 핀 제거 |
| AI 자동생성 | ai-generation | 🔧 세부과목(examType 포함) 반영 |
| 지문 세트문항 | passages | ✅ 완료 |

---

## 2. 엔드포인트별 상태

### auth (`/auth`) — ✅ 손댈 것 없음
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| POST /auth/register | ✅ | 이메일+비번 → Bcrypt → JWT |
| POST /auth/login | ✅ | 동일 |
| GET /auth/me | ✅ | 현재 사용자 |

### catalog
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /subjects | 🔧 | `examType` 3단 분류 필드 포함. 프론트가 대분류로 그룹핑 |
| POST /subjects | 🔧 | 세부과목 의미로 사용(`examType`, `examCategory`, `name` 요구) |
| GET /subjects/:id/units | ❌ | 단원 트리 제거 |
| POST /units | ❌ | 단원 생성 제거 |
| GET /tags | ✅ | 교차 태그 유지(오답노트 유형 집계에 활용) |
| POST /tags | ✅ | 유지 |

### questions (`/questions`)
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /questions | 🔧 | QueryDto: `unitId`→`subjectId`, `questionType` enum→문자열 |
| GET /questions/:id | 🔧 | `unit` include → `subject` |
| POST /questions | 🔧 | `primaryUnitId`→`subjectId`, 유형 문자열, `correctAnswerText` 추가, 객관식만 choices 필수 |
| PATCH /questions/:id | 🔧 | 동일 파급 |
| POST /questions/:id/publish | ✅ | 내부 참조만 정리 |
| DELETE /questions/:id | ✅ | 소프트 삭제(ARCHIVED) 유지 |
| **GET /questions/:id/stats** | 🆕 | **(B1 Task)** 정답률/시간 및 선지분포 조회 (캐시 기반) |
| **POST /questions/:id/choices/regenerate** | 🆕 | **(B2 Task)** AI 오답 선지 동기 재생성 (10초 타임아웃) |

### workbooks (`/workbooks`) — 🆕 전체 신규 (Pick & Mix)
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| **GET /workbooks** | 🆕 | 탐색·필터·정렬 (주력) |
| **POST /workbooks** | 🆕 | 문제집 생성 |
| **GET / PATCH / DELETE /workbooks/:id** | 🆕 | 상세 조회 / 수정 / 삭제 |
| **POST /workbooks/:id/fork** | 🆕 | 남의 문제집 통째 포크 |
| **POST /workbooks/:id/questions** | 🆕 | 문항 담기(Pick & Mix) |
| **DELETE /workbooks/:id/questions/:questionId**| 🆕 | 문항 빼기 |
| **PUT /workbooks/:id/questions/order** | 🆕 | 문항 전체 순서 재배열 |
| **POST /workbooks/:id/start** | 🆕 | 문제집 바로 풀기 (세션 생성), `skippedQuestionIds` 반환 |

### ai-generation (`/ai-generations`)
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| POST /ai-generations | 🔧 | `unitId`→`subjectId`, 프롬프트 컨텍스트에 시험+대분류+세부과목 전달 |
| GET /ai-generations/:id | ✅ | 상태 폴링, 거의 그대로 |
| (내부) processor/llm | 🔧 | 유형 문자열화, `[[blank]]`/shortAnswers 제거, 정답은 correctAnswerText로 |

### passages (`/passages`) — ✅ 손댈 것 거의 없음
| 메서드/경로 | 상태 |
| --- | --- |
| GET /passages / GET /passages/:id | ✅ |
| POST /passages / PATCH /passages/:id | ✅ |
| POST /passages/:id/publish / DELETE /passages/:id | ✅ |

### media (`/media-assets`) — Supabase 직접 업로드
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /media-assets | ✅ | 문제/지문 매핑 조회 |
| POST /media-assets | 🔧 | `assetType` IMAGE 고정, `sourceCode` 제거. Supabase public URL 등록용 |
| DELETE /media-assets/:id | ✅ | 유지 |
| (업로드 엔드포인트) | — | **신규 없음.** 프론트가 Supabase Storage에 직접 업로드 |

### exam-sessions (`/exam-sessions`)
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| POST /exam-sessions | 🔧 | filter `unitIds` 제거, **subjectId 조건부 필수화**(문제집/교차과목용), `workbookId` 필드 수용 |
| GET /exam-sessions/:id | 🔧 | 마스킹 대상: 선지 isCorrect + `correctAnswerText` + 해설 |
| PUT /exam-sessions/questions/:sqId/answer | 🔧 | `blankAnswers` 제거, 채점 분기(객/단답 자동) |
| POST /exam-sessions/questions/:sqId/hint | ✅ | 힌트 유지 |
| POST /exam-sessions/:id/submit | 🔧 | 자동채점+시간+선지 집계 및 갱신, 서술형 null 처리 |
| **PUT /exam-sessions/questions/:sqId/self-grade** | 🆕 | **서술형 자기채점(O/X) 반영** |

### reviews (`/questions/:id/reviews`) — ✅ 유지
| 메서드/경로 | 상태 |
| --- | --- |
| GET /questions/:id/reviews | ✅ 평점 요약 |
| PUT /questions/:id/reviews | ✅ 별점 rating + 체감난이도 perceivedDifficulty |
| DELETE /reviews/:id | ✅ |

### comments (`/questions/:id/comments`)
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /questions/:id/comments | 🔧 | 정렬에서 `isPinned` 제거(최신순) |
| POST /questions/:id/comments | ✅ | 대댓글 `parentCommentId` 유지 |
| PATCH /comments/:id | ✅ | 수정 |
| DELETE /comments/:id | ✅ | 삭제(답글 동반) |
| POST /comments/:id/pin | ❌ | 핀 제거 |
| DELETE /comments/:id/pin | ❌ | 핀 제거 |

### annotations (오답노트 2.0 — memos 모듈 개편)
> 상세 설계: `2026-07-08-qidea-wrongnote-annotation-design.md`
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /me/memos | ❌ | 제거(→ 아래 주석 CRUD로 대체) |
| GET /questions/:id/memo | ❌ | 제거 |
| PUT /questions/:id/memo | ❌ | 제거 |
| DELETE /questions/:id/memo | ❌ | 제거 |
| **GET /questions/:id/annotations** | 🆕 | 해당 문항 내 주석 목록(렌더 재적용용) |
| **POST /questions/:id/annotations** | 🆕 | 주석 생성(하이라이트/밑줄+태그+메모) |
| **PATCH /annotations/:id** | 🆕 | 주석 수정(본인) |
| **DELETE /annotations/:id** | 🆕 | 주석 삭제(본인) |

### me (오답노트·풀이기록)
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /me/exam-sessions | ✅ | 풀이기록(제출 세션) — 구현됨 |
| GET /me/wrong-notes | ❌ | 제거 → `/me/notes`로 병합 |
| **GET /me/notes** | 🆕 | **통계+메모 병합**: summary(bySubject·byType·byReason) + wrongQuestions(주석 중첩) |

### search_logs (인기 검색어) — ❌ 취소 확정
| 메서드/경로 | 상태 | 비고 |
| --- | --- | --- |
| GET /search/trending | ❌ | 구현하지 않음. `viewCount` 기반 인기순 탐색으로 대체. |

### variants — ❌ 모듈 전체 제거
| 메서드/경로 | 상태 |
| --- | --- |
| GET /questions/:id/variants | ❌ |
| POST /questions/:id/variants | ❌ |
| DELETE /variants/:id | ❌ |
| (app.module 등록 해제 + 폴더 삭제) | ❌ |

---

## 3. 집계 요약

- ✅ **그대로(≈13)**: auth 3, tags 2, passages 6, questions publish/delete 2, media get/delete 2, reviews 3, comments 3, me/exam-sessions 1 등
- 🔧 **수정(≈13)**: catalog subjects, questions list/detail/create/patch, ai-generation, media create, exam-sessions 4개, comments list
- 🆕 **신규(14)**: workbooks 관련 8, self-grade 1, stats/regenerate 2, 주석 CRUD 4(`GET/POST /questions/:id/annotations`, `PATCH/DELETE /annotations/:id`), 병합 `GET /me/notes` 1
- ❌ **제거(13)**: catalog units 2, comments pin 2, variants 3, 옛 memo 엔드포인트 4, `GET /me/wrong-notes` 1, trending 1

---

## 4. 서비스 리팩터링 실행 순서(제안)

1. **공통 상수/타입**: `QuestionKind = '객관식' | '주관식'` 상수, DTO validation(`@IsIn`) 정의.
2. **variants 제거**: 모듈 삭제 + `app.module` 등록 해제 → 에러 즉시 소거.
3. **catalog**: units 제거 및 `subjects` 3단 분류(`examType`) 마이그레이션.
4. **workbooks (신규)**: 문제집 테이블 및 엔드포인트(담기, 바로풀기 등) 구현.
5. **questions**: subjectId·유형 문자열·correctAnswerText 반영, B1/B2 태스크 구현.
6. **ai-generation**: subjectId·유형 문자열·blank 제거, 프롬프트에 `examType` 추가.
7. **grading.util + exam-sessions**: subjectId 조건부 필수화, 채점 분기(객/단답 자동), 마스킹, self-grade 추가.
8. **comments**: 핀 제거.
9. **media**: sourceCode 제거.
10. **annotations(memos 개편) / me**: 단일 메모 → 다행 주석 CRUD, `/me/notes` 병합.
11. **빌드 green 확인** → 시드 재실행.
