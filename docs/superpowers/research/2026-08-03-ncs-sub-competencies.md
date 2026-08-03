# NCS 직업기초능력 10개 능력 — 공식 하위요소(하위영역) 조사

- **Issue**: [#30](https://github.com/rladnwls122/I-EA/issues/30) "NCS 10개 능력별 공식 하위요소 목록 조사" (child of [#24](https://github.com/rladnwls122/I-EA/issues/24) "[Map] NCS 문항 유형(능력 하위영역) 분류체계")
- **Purpose**: ground-truth input for designing the 4-level NCS classification (examType → examCategory → 능력 → 하위요소) referenced in issue #24.
- **Researched**: 2026-08-03
- **Scope**: 고용노동부/한국산업인력공단(HRDK)이 관리하는 NCS(국가직무능력표준, ncs.go.kr)의 10개 직업기초능력에 대한 공식 하위요소 목록.

## TL;DR

The classic 10-domain 직업기초능력 standard — the one this repo's classification design (#24) is presumably targeting — has **34 official sub-elements (하위요소)** across the 10 competencies, verified directly against raw HTML/PDF content served by `ncs.go.kr` / `m.ncs.go.kr` (not AI-summarized fetches — see [Methodology](#methodology)).

**Important flag for the design phase**: as of December 2025, HRDK published a *new* official standard, **"직업공통능력"**, that supersedes 직업기초능력 with a restructured **7-domain, 3-level** hierarchy (영역 → 하위능력 → 하위능력요소). Both the old and new standards are live side-by-side on ncs.go.kr today. See [§3](#3-standard-in-flux-직업기초능력--직업공통능력-as-of-2025-12) — issue #24 should explicitly decide which standard the schema targets before finalizing the classification design.

## 1. Summary table — 직업기초능력 (10개, classic/current-use standard)

| # | 능력 | 하위요소 (공식 순서) | 개수 |
|---|---|---|---|
| 1 | 의사소통능력 | 문서이해능력, 문서작성능력, 경청능력, 의사표현능력, 기초외국어능력 | 5 |
| 2 | 수리능력 | 기초연산능력, 기초통계능력, 도표분석능력, 도표작성능력 | 4 |
| 3 | 문제해결능력 | 사고력, 문제처리능력 | 2 |
| 4 | 자기개발능력 | 자아인식능력, 자기관리능력, 경력개발능력 | 3 |
| 5 | 자원관리능력 | 시간관리능력, 예산관리능력, 물적자원관리능력, 인적자원관리능력 | 4 |
| 6 | 대인관계능력 | 팀워크능력, 리더십능력, 갈등관리능력, 협상능력, 고객서비스능력 | 5 |
| 7 | 정보능력 | 컴퓨터활용능력, 정보처리능력 | 2 |
| 8 | 기술능력 | 기술이해능력, 기술선택능력, 기술적용능력 | 3 |
| 9 | 조직이해능력 | 경영이해능력, 체제이해능력(=조직체제이해능력), 업무이해능력, 국제감각 | 4 |
| 10 | 직업윤리 | 근로윤리, 공동체윤리 | 2 |

**합계: 34개 하위요소.** 이는 흔히 통용되는 참고 목록과 이름·개수 모두 9/10 능력에서 일치한다. **조직이해능력 1건은 하위요소 순서에 차이가 확인됨** — [§2.9](#9-조직이해능력-4) 참고.

## 2. 능력별 상세 — 출처 및 신뢰도

각 항목은 `m.ncs.go.kr`의 공식 학습모듈 페이지 raw HTML을 직접 `curl`로 가져와 검증했으며(요약 AI가 아닌 원본 텍스트 직접 확인 — [Methodology](#methodology) 참고), 이 중 3개 능력은 HRDK가 발간한 공식 PDF 가이드북 본문과 교차 검증했다.

### 1. 의사소통능력 (5)
문서이해능력, 문서작성능력, 경청능력, 의사표현능력, 기초외국어능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=121` — NCS 공식 학습모듈 페이지("01.의사소통능력"). breadcrumb 번호 체계 `1.총론 → 2.문서이해능력 → 3.문서작성능력 → 4.경청능력 → 5.의사표현능력 → 6.기초외국어능력`를 raw HTML에서 직접 확인.
- 신뢰도: 높음.

### 2. 수리능력 (4)
기초연산능력, 기초통계능력, 도표분석능력, 도표작성능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=122`.
- 신뢰도: 높음.

### 3. 문제해결능력 (2)
사고력, 문제처리능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=123`.
- 신뢰도: 높음.

### 4. 자기개발능력 (3)
자아인식능력, 자기관리능력, 경력개발능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=124`.
- 신뢰도: 높음.

### 5. 자원관리능력 (4)
시간관리능력, 예산관리능력, 물적자원관리능력, 인적자원관리능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=125`.
- 신뢰도: 높음.

### 6. 대인관계능력 (5)
팀워크능력, 리더십능력, 갈등관리능력, 협상능력, 고객서비스능력

- Sources:
  - `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=126` (학습모듈 페이지)
  - `https://www.ncs.go.kr/common/file/viewFile2.do?mgmtNo=37` — HRDK 공식 "직업기초능력 가이드북: 학습자용 대인관계능력" PDF(61+ 페이지, 다운로드 후 텍스트 추출). 본문에 다음과 같이 명시: *"대인관계능력은 팀워크능력, 리더십능력, 갈등관리능력, 협상능력, 고객서비스능력으로 구분될 수 있다."*
- 신뢰도: 높음 (2개 독립 출처로 교차 검증).

### 7. 정보능력 (2)
컴퓨터활용능력, 정보처리능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=127`.
- 신뢰도: 높음.

### 8. 기술능력 (3)
기술이해능력, 기술선택능력, 기술적용능력

- Source: `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=128`.
- 신뢰도: 높음.

### 9. 조직이해능력 (4)
경영이해능력, 체제이해능력, 업무이해능력, 국제감각 — **순서가 흔한 참고 자료와 다름, 아래 참고**

- Sources:
  - `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=129` (학습모듈 페이지, 번호 체계 `2.경영이해능력 → 3.체제이해능력 → 4.업무이해능력 → 5.국제감각`)
  - `https://www.ncs.go.kr/common/file/viewFile2.do?mgmtNo=47` — HRDK 공식 "직업기초능력 가이드북: 학습내용 확인하기 조직이해능력" PDF. 목차에 `I-2-가: 경영이해능력`, `I-2-나: 체제이해능력`, `I-2-다: 업무이해능력`, `I-2-라: 국제감각` 명시.
- 신뢰도: 4개 하위요소 구성은 높음; **순서는 2개의 독립된 공식 문서로 확인됨** (아래 §2.9-discrepancy 참고).

### 10. 직업윤리 (2)
근로윤리, 공동체윤리

- Sources:
  - `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=130`
  - `https://m.ncs.go.kr/common/file/viewFile2.do?mgmtNo=50` — HRDK 공식 직업윤리 가이드북 PDF. 목차 `J-2-가: 근로윤리`, `J-2-나: 공동체윤리`, 본문에서도 붙여쓰기 형태로 일관되게 확인.
- 신뢰도: 높음 (2개 독립 출처로 교차 검증).

## 2.9-discrepancy 조직이해능력 순서 불일치

가장 흔히 통용되는 참고 목록(예: 다수의 취업 준비 자료)은 순서를 **국제감각, 조직체제이해능력, 경영이해능력, 업무이해능력**(국제감각이 먼저) 으로 제시하는 경우가 많다. 그러나 독립된 두 개의 공식 출처 — 실시간 `dirSeq=129` 학습모듈 페이지와 HRDK 가이드북 PDF(`mgmtNo=47`) — 는 모두 **경영이해능력 → 체제이해능력 → 업무이해능력 → 국제감각** (국제감각이 마지막) 순서를 명시한다. 하위요소 4개의 구성 자체는 동일하며 순서만 다르다. 스키마에서 순서(ordinal)를 인코딩할 경우 공식 출처의 순서를 채택할 것을 권장한다.

## 3. 표기 변형 (실제 불일치 아님)

ncs.go.kr에는 모든 `dirSeq=12x` 학습모듈 페이지에 공통으로 표시되는 "하위요소 통합 검색/필터" 표가 있는데, 이 표에서는 셀 줄바꿈 때문에 일부 명칭이 띄어쓰기된 형태로 렌더링된다. 반면 breadcrumb과 HRDK PDF 본문은 일관되게 붙여쓰기 형태를 사용한다. 붙여쓰기 형태를 공식 표기로 채택했다:

- **조직체제이해능력**: 필터 표에서는 "조직 체제 이해능력"으로 표시되지만, 가이드북 PDF 헤더는 짧은 형태인 "체제이해능력"을 사용. 동일한 하위요소를 가리키며, "조직체제이해능력"이 더 널리 인용되는 전체 형태.
- **팀워크능력 vs 팀웍능력**: 동일한 필터 표는 이 하위요소를 **"팀웍능력"**("크" 없이)로 표기하는데, 이는 ncs.go.kr 자체 사이트 내 실제 불일치로 보인다. 그러나 `dirSeq=126` 학습모듈 breadcrumb과 HRDK 가이드북(`mgmtNo=37`) 본문은 모두 **"팀워크능력"**을 일관되게 사용. "팀워크능력"이 현재 공식 용어로 판단되며, 필터 표의 "팀웍능력"은 예전 데이터의 잔재로 추정.
- **근로윤리/공동체윤리 띄어쓰기**: 필터 표는 "근로 윤리", "공동체 윤리"(띄어쓰기 포함)로 표시하지만, 가이드북 PDF 본문은 일관되게 붙여쓰기("근로윤리"/"공동체윤리") 사용. 위와 동일한 표 너비 줄바꿈 아티팩트로 판단, 붙여쓰기가 정확한 형태.
- **기초외국어능력 띄어쓰기**: 필터 표는 "기초 외국어 능력"(띄어쓰기)로 표시하지만, 모듈 breadcrumb(`dirSeq=121`)은 "기초외국어능력"(붙여쓰기)으로 표시. 다른 가이드북들과의 일관성 및 통상 사용례에 따라 붙여쓰기를 정확한 형태로 채택.

## 4. 표준 변경 중: 직업기초능력 → 직업공통능력 (2025.12 기준)

**이 조사에서 가장 중요하게 플래그할 사항.** HRDK/ncs.go.kr이 2025년 12월 발간한 92페이지 공식 문서 **"2025.12 직업공통능력 표준 개편(직업기초능력)"**을 확인했다. 이 문서는 "직업기초능력" 명칭을 **"직업공통능력"**으로 대체하고, 구조를 다음과 같이 재편한다:

- **10개 → 7개 영역**으로 축소 (자원관리능력, 정보능력, 기술능력, 조직이해능력을 독립 영역에서 제외; 디지털능력 신설; 일부 명칭 변경)
- 계층 구조를 **flat "영역 → 하위요소"에서 3단계 "영역 → 하위능력 → 하위능력요소"**로 변경

ncs.go.kr에는 신규 표준의 실사용 페이지(예: `m.ncs.go.kr/unity/th03/TH0309.do?jobCd=04`)가 "(구)직업기초능력" 섹션과 나란히 이미 배포되어 있어, 신·구 표준이 현재 동시에 라이브 상태임을 확인했다.

신규 7개 영역 구조(공식 PDF에서 확인, 하위능력 단위):

- 의사소통능력 → 문서소통능력 / 구두소통능력 / 외국어소통능력 (각각 하위능력요소 3개씩으로 추가 세분화)
- 수리능력 → 연산능력 / 통계활용능력 / 도표활용능력
- 문제해결능력 → 문제분석능력 / 대안발굴능력 / 의사결정능력
- 자기관리능력 → 경력개발능력 / 적응학습능력 / 시간관리능력
- 대인관계능력 → 협업능력 / 리더십 / 갈등관리능력
- 디지털능력 (신설) → 디지털활용능력 / 인공지능(AI)활용능력 / 디지털책임의식
- 직업윤리 → 근로윤리 / 직장공동체의식 / 산업안전보건의식

Source: `https://www.ncs.go.kr/web/job/contents/한국산업인력공단_직업기초능력 표준_최종.pdf` (92페이지 공식 문서, 다운로드 후 텍스트 추출. 표지, 일러두기, 신·구 대조표까지 원문으로 확인).

**#24 설계 시 결정 필요**: 스키마가 (a) 현재도 NCS 기반 채용에서 널리 쓰이는 기존 10개 직업기초능력 표준을 타깃할지, (b) 정부의 최신(2026년 8월 기준) 공식 표준인 7개 직업공통능력 구조를 타깃할지, (c) 두 표준을 모두 수용 가능한 형태로 설계할지 issue #24에서 명시적으로 결정할 것을 권장한다.

## Methodology

초기 `WebFetch` 호출로 `ncs.go.kr`/`m.ncs.go.kr` 페이지를 조회했을 때, 프롬프트에 예시로 제공한 참고 목록과 지나치게 정확히 일치하는 결과가 나왔다 — 이는 소형 요약 모델이 페이지의 실제 내용을 읽는 대신 프롬프트 내 예시 패턴을 그대로 이어받았을 위험을 시사한다(실제로 재검증 결과 fetch 중 하나는 로그인/동의 월(wall) 페이지로, 실질적 콘텐츠가 거의 없었음). 이 위험을 배제하기 위해 모든 검증을 raw HTML/PDF를 `curl`로 직접 가져와 서버 측에서 텍스트를 추출/grep하는 방식으로 전환했으며, LLM 요약 단계를 거치지 않았다. 본 문서의 10개 능력 확인과 3건의 PDF 가이드북 교차검증은 모두 이 원본 콘텐츠 직접 검증에 근거한다.

## 검증에 사용된 전체 출처 URL

- `https://m.ncs.go.kr/th03/TH0302List.do?dirSeq=121` ~ `dirSeq=130` (10개 능력 공식 학습모듈 페이지 전체, curl로 raw HTML 확인)
- `https://www.ncs.go.kr/common/file/viewFile2.do?mgmtNo=47` — 조직이해능력 HRDK 공식 가이드북 PDF
- `https://www.ncs.go.kr/common/file/viewFile2.do?mgmtNo=37` — 대인관계능력 HRDK 공식 가이드북 PDF
- `https://m.ncs.go.kr/common/file/viewFile2.do?mgmtNo=50` — 직업윤리 HRDK 공식 가이드북 PDF
- `https://www.ncs.go.kr/web/job/contents/한국산업인력공단_직업기초능력 표준_최종.pdf` — 2025.12 직업공통능력 개편 표준 (92페이지)
- `https://m.ncs.go.kr/unity/th03/TH0309.do?jobCd=04` — 신규 직업공통능력 > 자기관리능력 실사용 페이지 (신규 표준이 프로덕션에 배포되어 있음을 확인)
- `https://www.ncs.go.kr/th01/TH-102-002-04.scdo` — NCS 학습모듈 구성 안내 페이지 ("직업공통능력" vs "(구)직업기초능력" 메뉴 구분 확인)
