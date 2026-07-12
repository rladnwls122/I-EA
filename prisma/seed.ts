/**
 * Q-Idea 데모/테스트 시드.
 *   - "시드 데이터 작성 가이드"의 모델 커버리지·의존성 순서를 따르되 볼륨은 축소했다.
 *   - 매 실행마다 시드 도메인을 FK 역순으로 비우고 다시 채운다(멱등: 재생성 방식).
 *     로컬/개발 DB 전용 — 운영 DB에 절대 실행하지 말 것.
 *   - Faker 미사용(무의존): 아래 순수 랜덤 헬퍼로 데이터를 만든다.
 */
import {
  PrismaClient,
  UserRoleType,
  QuestionStatus,
  PassageStatus,
  GenerationStatus,
  MediaAssetType,
  ExamSessionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const OBJECTIVE = '객관식';
const SUBJECTIVE = '주관식';
const DEMO_PASSWORD = 'demo1234!';

const REAL_PASSAGES = [
  // 0. 사회/윤리 (기존)
  [
    '자유론의 핵심은 개인의 자유를 최대한 보장하되, 타인에게 피해를 주는 행위(해악의 원리)에 한해서만 사회적 개입을 허용해야 한다는 것이다.',
    '밀은 사상의 자유와 표현의 자유가 진리 탐구를 위해 필수불가결하다고 보았다. 소수의 의견이라도 탄압받아서는 안 되며, 오히려 그 의견이 진리일 가능성을 배제할 수 없다.',
    '따라서 현대 민주주의 사회에서 표현의 자유는 단순히 개인의 권리를 넘어, 사회 전체의 발전과 오류 수정을 위한 가장 강력한 도구로 작용한다.'
  ],
  // 1. 물리/과학 (기존)
  [
    '양자역학에서 불확정성 원리는 입자의 위치와 운동량을 동시에 정확하게 측정할 수 없다는 근본적인 한계를 제시한다.',
    '이는 관측 기술의 한계 때문이 아니라, 미시 세계를 지배하는 자연의 내재적 성질이다. 파동-입자 이중성에 의해 입자는 위치가 확정될수록 파동으로서의 성질(운동량)이 불분명해진다.',
    '이 원리는 양자 컴퓨터와 양자 암호 등 현대 첨단 기술의 이론적 기반이 되며, 결정론적 세계관에 대한 근본적인 도전을 던졌다.'
  ],
  // 2. 한국사/역사 (기존)
  [
    '19세기 후반, 조선은 서구 열강과 일본의 개항 압력 속에서 쇄국 정책과 개화 정책 사이의 심각한 갈등을 겪었다.',
    '강화도 조약(1876)을 기점으로 불평등 조약 체제에 편입된 조선은, 자주적인 근대화(동도서기론)를 시도했으나 보수 세력의 반발과 열강의 간섭으로 난항을 겪었다.',
    '특히 갑신정변(1884)과 동학 농민 운동(1894)은 조선 사회의 내부적 모순을 해결하려는 다양한 계층의 시도였으나, 결국 외세의 개입을 초래하는 결과를 낳고 말았다.'
  ],
  // 3. 문학 (기존)
  [
    '별 헤는 밤 - 윤동주',
    '계절이 지나가는 하늘에는 가을로 가득 차 있습니다.',
    '나는 아무 걱정도 없이 가을 속의 별들을 다 헤일 듯합니다.',
    '가슴 속에 하나 둘 새겨지는 별을 이제 다 못 헤는 것은 쉬이 아침이 오는 까닭이요, 내일 밤이 남은 까닭이요, 아직 나의 청춘이 다하지 않은 까닭입니다.'
  ],
  // 4. 정보/AI (기존)
  [
    '인공지능(AI) 모델의 학습은 대량의 데이터를 바탕으로 신경망의 가중치를 최적화하는 과정이다. 이 과정에서 손실 함수(Loss Function)는 모델의 예측값과 실제 정답 간의 오차를 수치화한다.',
    '오차 역전파(Backpropagation) 알고리즘은 이 손실 함수의 기울기(Gradient)를 계산하여 가중치를 업데이트한다. 하지만 신경망이 깊어질수록 기울기 소실(Gradient Vanishing) 문제가 발생할 수 있다.',
    '이를 해결하기 위해 활성화 함수(예: ReLU), 잔차 연결(Residual Connection), 정규화(Normalization) 등 다양한 기법이 개발되어 현대 딥러닝의 비약적인 발전을 이끌었다.'
  ],
  // 5. 수학/미적분
  [
    '미적분학의 기본 정리는 미분과 적분이 서로 역연산 관계에 있음을 보여주는 해석학의 핵심 정리이다.',
    '제1 기본 정리는 연속 함수의 정적분을 미분하면 원래의 함수가 된다는 것을 의미하며, 제2 기본 정리는 함수의 정적분을 부정적분의 차이를 통해 쉽게 계산할 수 있음을 보여준다.',
    '이 정리는 기하학적 넓이 구하기와 물리적 변화율 계산을 하나로 연결하여 현대 수학과 공학 발전의 초석이 되었다.'
  ],
  // 6. 영어 독해
  [
    'The rapid advancement of artificial intelligence has fundamentally altered the landscape of modern employment.',
    'While optimists argue that AI will create new, higher-paying jobs and eliminate tedious tasks, critics warn of unprecedented job displacement across both blue-collar and white-collar sectors.',
    'Ultimately, the societal impact of this transition will heavily depend on government policies emphasizing continuous education and workforce retraining.'
  ],
  // 7. 생명과학
  [
    '멘델의 유전 법칙은 완두콩 교배 실험을 통해 밝혀진 고전 유전학의 기초이다. 우열의 원리는 대립 유전자가 함께 있을 때 우성 형질만 발현된다는 것을 설명한다.',
    '분리의 법칙은 생식세포 형성 시 대립 유전자가 나뉘어 들어감을, 독립의 법칙은 서로 다른 형질을 결정하는 유전자들이 서로 영향을 주지 않고 독립적으로 유전됨을 의미한다.',
    '하지만 이후 연관 유전, 중간 유전, 다인자 유전 등 멘델의 법칙을 벗어나는 다양한 유전 현상이 발견되며 현대 유전학으로 발전하게 되었다.'
  ],
  // 8. 화학
  [
    '산과 염기를 정의하는 방식은 화학의 발전과 함께 확장되어 왔다. 아레니우스는 수용액에서 수소 이온(H+)을 내놓는 물질을 산, 수산화 이온(OH-)을 내놓는 물질을 염기로 정의했다.',
    '하지만 이 정의는 수용액 상태에만 국한된다는 한계가 있어, 브뢴스테드와 로우리는 양성자(H+)를 주는 물질을 산, 받는 물질을 염기로 새롭게 정의했다.',
    '나아가 루이스는 전자쌍을 기준으로 산과 염기를 포괄적으로 정의하여, 양성자가 관여하지 않는 반응까지 설명할 수 있게 되었다.'
  ],
  // 9. 지구과학
  [
    '판 구조론은 지구의 겉부분인 암석권이 여러 개의 판으로 나뉘어 있으며, 이 판들이 맨틀 대류에 의해 이동한다는 이론이다.',
    '판의 경계는 이동 방향에 따라 발산형, 수렴형, 보존형 경계로 나뉜다. 수렴형 경계에서는 해구와 습곡 산맥이 형성되며 잦은 지진과 화산 활동이 동반된다.',
    '베게너의 대륙 이동설에서 출발한 이 이론은 해저 확장설을 거쳐 현대 지구과학의 가장 중요한 패러다임으로 자리 잡았다.'
  ],
  // 10. 경제
  [
    '시장에서 가격은 수요와 공급의 상호작용에 의해 결정된다. 수요의 법칙에 따라 가격이 오르면 수요량은 감소하고, 공급의 법칙에 따라 가격이 오르면 공급량은 증가한다.',
    '수요 곡선과 공급 곡선이 교차하는 지점에서 시장의 균형 가격과 균형 거래량이 형성된다.',
    '그러나 외부 효과나 정보의 비대칭성과 같은 요인으로 인해 시장이 자원을 효율적으로 배분하지 못하는 현상을 시장 실패라고 하며, 이때 정부의 개입이 정당화될 수 있다.'
  ],
  // 11. 법/정치
  [
    '대한민국의 헌법재판소는 헌법의 수호와 국민의 기본권 보장을 위해 설립된 독립적인 국가 기관이다.',
    '주요 권한으로는 법률이 헌법에 위반되는지 심사하는 위헌법률심판, 고위 공직자의 파면을 결정하는 탄핵심판, 정당의 해산을 심판하는 정당해산심판이 있다.',
    '또한 공권력의 행사나 불행사로 인해 헌법상 보장된 기본권을 침해받은 국민이 구제를 요청하는 헌법소원심판은 헌법재판소의 핵심 기능 중 하나이다.'
  ],
  // 12. 공기업 NCS
  [
    '효과적인 비즈니스 커뮤니케이션은 조직의 목표 달성과 갈등 예방을 위해 필수적이다.',
    '문서 작성 시에는 결론을 먼저 제시하는 두괄식 구성을 취하고, 객관적인 데이터와 명확한 용어를 사용하여 오해의 소지를 없애야 한다.',
    '또한, 상대방의 입장과 배경지식을 고려하여 정보를 선별하고, 적절한 피드백을 주고받는 적극적 경청의 자세가 요구된다.'
  ],
  // 13. 토익 RC/LC
  [
    'Dear Mr. Smith, We are writing to inform you that your recent order (#89342) has been successfully processed and dispatched from our main warehouse.',
    'Due to unexpectedly high demand for the new ergonomic office chairs, there was a slight delay in shipping, for which we sincerely apologize.',
    'As a token of our appreciation for your patience, we have enclosed a 15% discount voucher that can be applied to your next purchase on our website.'
  ],
  // 14. 행정학
  [
    '관료제는 막스 베버에 의해 체계화된 대규모 조직 운영 방식으로, 계층제, 문서주의, 비정의성, 전문성을 그 특징으로 한다.',
    '이러한 특징은 조직의 안정성과 효율성을 높이고 예측 가능성을 제공하지만, 현대 사회에서는 급격한 환경 변화에 대한 적응력을 떨어뜨린다는 비판을 받는다.',
    '목표 대치(Goal Displacement) 현상이나 번문욕례(Red Tape)와 같은 역기능을 극복하기 위해 최근에는 애자일(Agile) 조직이나 네트워크 조직 등 유연한 대안 조직 모델이 강조되고 있다.'
  ],
  // 15. 행정법
  [
    '행정행위의 공정력이란, 비록 행정청의 처분에 위법한 하자가 있더라도 그것이 중대하고 명백하여 당연무효인 경우를 제외하고는, 권한 있는 기관에 의해 취소되기 전까지 일단 유효한 것으로 통용되는 효력을 말한다.',
    '이는 행정 법률관계의 안정성과 신뢰 보호를 위해 인정되는 특유의 효력이다.',
    '따라서 공정력이 인정되는 행정행위에 대해 불복하고자 하는 국민은 반드시 행정심판이나 행정소송 등의 정해진 쟁송 절차를 통해 그 취소를 구해야 한다.'
  ],
  // 16. 국어 문법
  [
    '국어의 음운 변동은 크게 교체, 탈락, 첨가, 축약의 네 가지 유형으로 분류할 수 있다.',
    '음절의 끝소리 규칙과 비음화, 유음화는 대표적인 교체 현상이며, 자음군 단순화는 두 자음 중 하나가 사라지는 탈락 현상에 해당한다.',
    '이러한 음운 변동은 주로 발음을 쉽고 편하게 하려는 발음 경제의 원칙이나, 소리를 명확하게 구별하여 전달하려는 표현 명료성의 원칙에 의해 자연스럽게 발생한다.'
  ],
  // 17. 한국사 (근현대)
  [
    '1919년 일어난 3.1 운동은 일제의 가혹한 무단 통치에 항거하여 거족적으로 일어난 최대 규모의 민족 해방 운동이다.',
    '민족 자결주의의 영향을 받아 지식인과 종교계 인사를 중심으로 민족 대표 33인이 독립 선언서를 낭독하며 시작되었고, 이후 학생, 상인, 농민 등 전 계층이 참여하는 전국적인 시위로 확산되었다.',
    '이 운동은 비록 일제의 무자비한 탄압으로 실패했으나, 대한민국 임시 정부 수립의 계기가 되었으며 일제의 통치 방식을 이른바 문화 통치로 바꾸게 하는 결정적인 역할을 했다.'
  ],
  // 18. 지리 / 사회
  [
    '카르스트 지형은 주로 석회암이 분포하는 지역에서 빗물이나 지하수에 의한 용식 작용으로 형성되는 독특한 지형이다.',
    '돌리네, 우발라와 같은 움푹 팬 와지나 석회 동굴이 대표적이며, 배수가 너무 잘 되어 지표수가 부족하므로 논농사보다는 밭농사나 과수원이 주로 발달한다.',
    '우리나라에서는 주로 강원도 남부와 충청북도 북부 지역(단양, 영월 등)의 고생대 조선 누층군에서 잘 관찰되며, 시멘트 공업의 중심지 역할을 하기도 한다.'
  ],
  // 19. 수학 (확률과 통계)
  [
    '정규 분포는 자연 현상이나 사회 현상에서 가장 흔하게 관찰되는 연속 확률 분포로, 종 모양의 좌우 대칭 곡선을 가진다.',
    '평균과 표준편차라는 두 가지 모수에 의해 그 형태가 완전히 결정되며, 특히 평균 주변에 데이터가 밀집하는 특성을 지닌다.',
    '중심 극한 정리에 따르면, 표본의 크기가 충분히 클 경우 모집단의 분포 형태와 상관없이 표본 평균의 분포는 근사적으로 정규 분포를 따르게 되어 통계적 추정의 핵심적인 근거가 된다.'
  ]
];

const REAL_STEMS = [
  '윗글의 내용과 일치하지 않는 것은?',
  '윗글을 바탕으로 <보기>를 이해한 내용으로 가장 적절한 것은?',
  '[A]와 [B]를 비교한 내용으로 적절하지 않은 것은?',
  '윗글의 핵심 주장으로 가장 적절한 것은?',
  '글쓴이의 관점에서 다음 사례를 평가할 때, 적절한 반응은?',
  '밑줄 친 ㉠의 문맥적 의미로 가장 가까운 것은?',
  '윗글에 나타난 서술상의 특징으로 가장 적절한 것은?',
  '윗글을 읽고 추론한 내용으로 적절하지 않은 것은?',
  '다음 중 윗글의 내용을 뒷받침하는 근거로 가장 적절한 것은?',
  '윗글의 전개 방식에 대한 설명으로 가장 적절한 것은?'
];

const REAL_CHOICES = [
  ['역사적 사실을 나열하며 객관성을 확보하고 있다.', '전문가의 견해를 인용하여 주장의 타당성을 높이고 있다.', '대조적 사례를 통해 대상의 특성을 부각하고 있다.', '질문과 답변의 형식을 통해 독자의 이해를 돕고 있다.', '비유적 표현을 사용하여 상황을 생동감 있게 묘사하고 있다.'],
  ['밀은 타인에게 피해를 주지 않는 한 개인의 자유는 절대적으로 보장되어야 한다고 보았다.', '소수의 의견이라도 진리일 가능성이 있으므로 탄압받아서는 안 된다.', '표현의 자유는 사회 발전과 오류 수정을 위해 반드시 필요하다.', '개인의 자유가 보장될 때 사회 전체의 행복 총량이 증가한다.', '다수결의 원칙에 따라 소수의 의견은 언제나 다수의 의견에 복종해야 한다.'],
  ['불확정성 원리는 관측 장비의 한계 때문에 발생한다.', '미시 세계에서는 위치와 운동량을 동시에 정확하게 측정할 수 없다.', '결정론적 세계관은 양자역학의 등장으로 한계에 부딪혔다.', '양자 암호 기술은 불확정성 원리를 응용한 것이다.', '입자의 파동-입자 이중성은 불확정성 원리와 밀접한 관련이 있다.'],
  ['강화도 조약은 조선이 맺은 최초의 근대적, 불평등 조약이다.', '동도서기론은 서양의 사상과 제도를 모두 수용하자는 입장이었다.', '갑신정변은 급진 개화파가 주도한 위로부터의 근대화 운동이다.', '동학 농민 운동은 반봉건, 반외세의 성격을 띠었다.', '조선의 근대화 운동은 외세의 간섭과 보수 세력의 반발로 어려움을 겪었다.']
];

const REAL_SHORT_ANS = ['해악의원리', '불확정성원리', '동도서기론', '수미상관', '기울기소실', '오차역전파', '잔차연결', '동학농민운동', '파동입자이중성', '표현의자유'];
const REAL_EXPLANATIONS = [
  '지문의 2문단에서 명확하게 설명하고 있는 부분입니다. 특히 핵심 개념의 정의를 주의 깊게 확인하세요.',
  '이 선지는 글쓴이의 주장과 정반대되는 내용을 담고 있으므로 오답입니다.',
  '<보기>의 사례는 본문의 두 번째 개념을 적용한 것입니다. 조건 A와 B의 관계를 파악해야 합니다.',
  '밑줄 친 부분의 문맥적 의미를 파악할 때는 앞뒤 문장의 인과관계를 살펴보는 것이 좋습니다.',
  '단편적인 정보만 보고 판단하면 함정에 빠지기 쉽습니다. 전체적인 맥락을 고려해야 합니다.'
];
const REAL_HINTS = [
  '첫 번째 단락의 마지막 문장에 주목해 보세요.',
  '<보기>의 두 번째 조건이 본문의 어떤 개념과 연결되는지 생각해 보세요.',
  '핵심어의 정의를 다시 한번 확인해 보세요.',
  '선지의 단어들이 본문에서 어떻게 변형되어 쓰였는지 대조해 보세요.'
];

const REAL_REVIEWS = [
  '평가원 기출과 퀄리티가 거의 비슷하네요. 좋은 문제입니다.',
  '선지 매력도가 높아서 함정에 빠지기 쉽습니다. 추천해요!',
  '근거가 살짝 빈약한 느낌이 있지만 전반적으로 괜찮습니다.',
  '너무 지엽적인 내용을 묻는 것 같아 아쉽네요.',
  '수능 특강 연계 공부하기에 딱 좋은 난이도입니다.',
  '다소 평이한 난이도입니다. 개념 확인용으로 좋습니다.',
  '킬러 문제로 손색이 없습니다. 사고력을 많이 요구하네요.',
  '해설이 정말 자세해서 혼자 공부하기 좋습니다.',
  null,
  null
];

const REAL_COMMENTS = [
  '3번 선지가 왜 틀린 건지 이해가 안 가는데 혹시 설명해주실 분 계신가요?',
  '아, 2문단 마지막 줄에 근거가 있었네요! 이제 이해했습니다.',
  '이 문제 난이도 어느 정도라고 생각하시나요? 저만 어려운가요 ㅠㅠ',
  '수능 14번 문제랑 느낌이 비슷하네요.',
  '해설 진짜 꼼꼼해서 감동입니다...',
  '이거 작년 9평 변형 문제 아닌가요?',
  '아 실수로 4번 골랐네 ㅋㅋㅋ 매력적인 오답이네요.',
  '단답형 부분 채점 기준이 좀 애매한 것 같아요.'
];

const REAL_ANNOTATION_TEXTS = [
  '이 부분이 글의 핵심 주장',
  '여기서 인과관계 역전됨',
  'A와 B 대조되는 부분',
  '문제의 조건과 불일치',
  '내가 헷갈렸던 선지',
  '예시를 일반화하는 오류 조심',
  '이 수식 변형과정 이해 안 됨',
  '다음에 꼭 다시 볼 것'
];

const REAL_ANNOTATION_MEMOS = [
  '개념 인지가 부족했음. 복습노트에 정리하자.',
  '항상 이런 식의 매력적 오답에 낚인다. 조심할 것!',
  '시간이 부족해서 지문을 끝까지 못 읽음 ㅠㅠ',
  '어휘 뜻을 정확히 몰라서 틀림.',
  '<보기> 조건을 하나 빼먹고 적용함. 꼼꼼히 읽자.',
  '선지 끊어 읽기 필수!',
  null,
  null
];

const REAL_WORKBOOKS = [
  { title: '수능 국어 독서 킬러 문항 모음', desc: '역대 평가원 기출 중 오답률 70% 이상이었던 지문만 모았습니다.' },
  { title: '수학I 지수로그함수 고난도 N제', desc: '내신과 수능을 동시에 대비할 수 있는 고퀄리티 자작 문항 20선.' },
  { title: '한국사 빈출 사료 정리집', desc: '가장 많이 출제되는 사료와 관련 문항을 시대순으로 정리했습니다.' },
  { title: '영어 빈칸 추론 약점 공략', desc: '빈칸 추론에서 항상 2개를 놓고 고민하는 학생들을 위한 훈련용.' },
  { title: '생명과학I 유전 가계도 마스터', desc: '복잡한 유전 가계도 문제를 논리적으로 접근하는 연습을 합니다.' },
  { title: '동아시아사 핵심 개념 OX', desc: '시험 직전 필수적으로 확인해야 할 개념들을 OX 퀴즈로 엮었습니다.' },
  { title: '국어 문학 EBS 연계 변형 모의고사', desc: '올해 수특/수완 연계 작품을 바탕으로 출제한 고퀄 모의고사입니다.' }
];
// --- 랜덤 헬퍼 (Faker 대체) ------------------------------------------------
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;
const sample = <T>(a: T[], n: number): T[] => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, Math.min(n, c.length));
};
// ProseMirror(Tiptap) 최소 문서
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const multiDoc = (paras: string[]) => ({
  type: 'doc',
  content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});
const blockArray = (text: string) => [
  { type: 'paragraph', content: [{ type: 'text', text }] }
];

// xp → level (xp.ts LEVEL_TIERS 인라인 복제; 시드에서 @/ 별칭 해석을 피한다)
const TIERS: [number, number][] = [
  [0, 1],
  [100, 2],
  [300, 3],
  [600, 4],
  [1000, 5],
  [5000, 10],
  [15000, 20],
];
const levelForXp = (xp: number) => TIERS.reduce((lv, [min, l]) => (xp >= min ? l : lv), 1);

async function chunkCreate<T>(model: { createMany: Function }, rows: T[], size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    await (model.createMany as any)({ data: rows.slice(i, i + size), skipDuplicates: true });
  }
}

// --- 1. 시드 도메인 초기화 (FK 역순) ---------------------------------------
async function clean() {
  await prisma.examSessionAnswer.deleteMany();
  await prisma.examSessionQuestion.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.userQuestionAnnotation.deleteMany();
  await prisma.questionComment.deleteMany();
  await prisma.questionReview.deleteMany();
  await prisma.questionChoiceStat.deleteMany();
  await prisma.workbookQuestion.deleteMany();
  await prisma.workbook.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.questionTag.deleteMany();
  await prisma.question.deleteMany();
  await prisma.passage.deleteMany();
  await prisma.aiGeneration.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.milestoneAchievement.deleteMany();
  await prisma.xpHistory.deleteMany();
  // 사용자 삭제 시 특정 계정은 보호
  const targetUserId = 'd8fadd1b-8c52-4b74-815d-29dbf31d75bc';
  await prisma.userRole.deleteMany({ where: { userId: { not: targetUserId } } });
  await prisma.user.deleteMany({ where: { id: { not: targetUserId } } });
}

async function main() {
  console.log('🧹 기존 시드 초기화...');
  await clean();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --- 2. Users (고정 3 + 랜덤 7) ------------------------------------------
  console.log('👤 users...');
  type U = { id: string; email: string; nickname: string; roles: UserRoleType[]; xp: number };
  const users: U[] = [];
  const R = UserRoleType;
  const targetUserId = 'd8fadd1b-8c52-4b74-815d-29dbf31d75bc';
  const fixed = [
    { id: randomUUID(), email: 'admin@demo.io', nickname: '관리자', roles: [R.ADMIN, R.CREATOR, R.CONSUMER] },
    { id: randomUUID(), email: 'creator@demo.io', nickname: '데모출제자', roles: [R.CREATOR, R.CONSUMER] },
    { id: randomUUID(), email: 'consumer@demo.io', nickname: '열공하는수험생', roles: [R.CONSUMER] },
  ];
  const existingUser = await prisma.user.findUnique({ where: { id: targetUserId }, include: { roles: true } });
  if (existingUser) {
    users.push({
      id: existingUser.id,
      email: existingUser.email,
      nickname: existingUser.nickname,
      roles: existingUser.roles.map(r => r.role as UserRoleType),
      xp: existingUser.xp
    });
  } else {
    fixed.push({ id: targetUserId, email: 'tester@demo.io', nickname: '발표용계정', roles: [R.CONSUMER, R.CREATOR] });
  }

  const nickPool = ['국어러버', '수학왕', '밤샘수험생', '오답장인', '만점기원', '조용한노력', '기출마스터'];
  const defs = [
    ...fixed.map((f) => ({ ...f, xp: f.email === 'consumer@demo.io' ? 1200 : randInt(200, 800) })),
    ...Array.from({ length: 7 }, (_, i) => ({
      id: randomUUID(),
      email: `user${i + 1}@demo.io`,
      nickname: nickPool[i],
      roles: i < 2 ? [R.CREATOR, R.CONSUMER] : [R.CONSUMER],
      xp: randInt(0, 3000),
    })),
  ];
  for (const d of defs) {
    const id = d.id;
    await prisma.user.create({
      data: {
        id,
        email: d.email,
        passwordHash,
        nickname: d.nickname,
        creatorBio: d.roles.includes(R.CREATOR) ? '데모 출제자입니다.' : null,
        xp: d.xp,
        level: levelForXp(d.xp),
        currentStreak: randInt(0, 15),
        longestStreak: randInt(5, 30),
        lastActiveDate: new Date(),
        roles: { create: d.roles.map((role) => ({ role })) },
      },
    });
    users.push({ id, email: d.email, nickname: d.nickname, roles: d.roles, xp: d.xp });
  }
  const creators = users.filter((u) => u.roles.includes(R.CREATOR));
  const consumers = users.filter((u) => u.roles.includes(R.CONSUMER));
  const byEmail = (e: string) => users.find((u) => u.email === e)!;

  // --- 3. Subjects (3단 분류: 시험 → 대분류 → 소분류) -----------------------
  console.log('📚 subjects...');
  // 시험별 대분류 → 소분류 매핑(현실적 조합만 생성). 시험/단원을 넉넉히 확장.
  const EXAM_MAP: Record<string, Record<string, string[]>> = {
    수능: {
      국어: ['문학', '독서', '화법과작문', '언어와매체'],
      수학: ['수학I', '수학II', '미적분', '확률과통계', '기하'],
      영어: ['독해', '어법', '어휘', '듣기'],
      한국사: ['전근대', '근현대'],
      사회탐구: [
        '생활과윤리',
        '윤리와사상',
        '한국지리',
        '세계지리',
        '동아시아사',
        '세계사',
        '정치와법',
        '경제',
        '사회문화',
      ],
      과학탐구: [
        '물리학I',
        '물리학II',
        '화학I',
        '화학II',
        '생명과학I',
        '생명과학II',
        '지구과학I',
        '지구과학II',
      ],
    },
    내신: {
      국어: ['문학', '독서', '화법과작문', '언어와매체'],
      수학: ['수학I', '수학II', '미적분', '확률과통계', '기하'],
      영어: ['독해', '어법', '듣기'],
      통합사회: ['정치', '경제', '사회', '문화', '윤리'],
      통합과학: ['물리', '화학', '생명', '지구과학'],
    },
    '공무원 9급': {
      국어: ['문법', '독해', '문학', '어휘'],
      영어: ['독해', '어휘', '문법', '생활영어'],
      한국사: ['전근대', '근현대'],
      행정법: ['총론', '각론'],
      행정학: ['총론'],
    },
    '공무원 7급': {
      헌법: ['총론', '기본권', '통치구조'],
      경제학: ['미시', '거시'],
      행정법: ['총론', '각론'],
      국어: ['문법', '독해'],
      영어: ['독해', '어휘'],
      한국사: ['전근대', '근현대'],
    },
    공기업: {
      NCS직업기초: [
        '의사소통능력',
        '수리능력',
        '문제해결능력',
        '자원관리능력',
        '정보능력',
        '조직이해능력',
        '직업윤리',
      ],
      전공: ['경영', '경제', '행정', '법'],
    },
    한능검: {
      한국사: ['선사', '고대', '고려', '조선', '근대', '일제강점기', '현대'],
    },
    토익: {
      LC: ['Part1_사진', 'Part2_응답', 'Part3_대화', 'Part4_설명문'],
      RC: ['Part5_문법', 'Part6_빈칸', 'Part7_독해'],
    },
  };
  type Subj = { id: string; name: string };
  const subjects: Subj[] = [];
  const subjectRows: any[] = [];
  let so = 0;
  for (const [examType, cats] of Object.entries(EXAM_MAP)) {
    for (const [examCategory, subs] of Object.entries(cats)) {
      for (const name of subs) {
        const id = randomUUID();
        subjectRows.push({ id, examType, examCategory, name, sortOrder: so++ });
        subjects.push({ id, name: `${examType}/${examCategory}/${name}` });
      }
    }
  }
  await chunkCreate(prisma.subject, subjectRows);

  // --- 4. Tags (출처/난이도/유형/단원/과목, 대폭 확장) ----------------------
  console.log('🏷️  tags...');
  const TAG_CATS: Record<string, string[]> = {
    출처: ['기출', '평가원', '교육청', 'EBS', '사설', 'N제', '수능특강', '수능완성', 'LEET', '모의고사', '교과서'],
    난이도: ['최고난도', '고난도', '중상', '중간', '기본', '심화', '개념'],
    유형: [
      '킬러',
      '준킬러',
      '계산',
      '그래프',
      '추론',
      '빈칸',
      '순서',
      '문장삽입',
      '단답형',
      '서술형',
      '자료해석',
      '사례적용',
      '어법',
      '어휘',
      '주제파악',
      '세부내용',
    ],
    단원: [
      '문학',
      '독서',
      '화법과작문',
      '언어와매체',
      '미적분',
      '확률과통계',
      '기하',
      '수학I',
      '수학II',
      '역학',
      '전자기',
      '유전',
      '생태',
      '지구시스템',
      '사료',
      '도표',
    ],
    과목: ['국어', '수학', '영어', '한국사', '사회', '과학', '행정법', '행정학'],
  };
  const tags: { id: string; name: string }[] = [];
  const tagRows: any[] = [];
  for (const [category, names] of Object.entries(TAG_CATS)) {
    for (const name of names) {
      const id = randomUUID();
      tagRows.push({ id, name, category });
      tags.push({ id, name });
    }
  }
  await chunkCreate(prisma.tag, tagRows);

  // --- 5. AiGeneration (~10) -----------------------------------------------
  console.log('🤖 ai_generations...');
  const MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  const genIds: string[] = [];
  const genRows = Array.from({ length: 10 }, () => {
    const id = randomUUID();
    genIds.push(id);
    const r = Math.random();
    return {
      id,
      creatorId: pick(creators).id,
      subjectId: pick(subjects).id,
      inputParams: {
        type: 'question-generation',
        count: randInt(1, 10),
        difficulty: randInt(1, 5),
      },
      model: pick(MODELS),
      status: r < 0.7 ? GenerationStatus.COMPLETED : r < 0.9 ? GenerationStatus.PENDING : GenerationStatus.FAILED,
    };
  });
  await chunkCreate(prisma.aiGeneration, genRows);

  // --- 6. Passages (~15) & 7. Questions (~80) (연결 세트 생성 포함) ------------
  console.log('📄 passages & questions...');
  const passageIds: string[] = [];
  const passageRows: any[] = [];
  const DIFF_POOL = [1, 2, 3, 3, 3, 4, 5];
  const choicesArrRandom = (correctIdx: number) => {
    const choiceSet = pick(REAL_CHOICES);
    return ['c1', 'c2', 'c3', 'c4', 'c5'].map((cid, i) => ({
      id: cid,
      content: blockArray(choiceSet[i] || `보기 ${i + 1}`),
      isCorrect: i === correctIdx,
    }));
  };
  type Q = { id: string; type: string; correctIdx: number; correctAnswerText: string | null; passageId: string | null };
  const questions: Q[] = [];
  const questionRows: any[] = [];

  // 세트 1: 고품질 지문(5개) 생성 및 과목 매핑 헬퍼
  const hqPassageIds: string[] = [];
  for (let i = 0; i < REAL_PASSAGES.length; i++) {
    const pid = randomUUID();
    hqPassageIds.push(pid);
    passageIds.push(pid);
    passageRows.push({
      id: pid,
      creatorId: pick(creators).id,
      generationId: chance(0.5) ? pick(genIds) : null,
      content: multiDoc(REAL_PASSAGES[i]),
      status: PassageStatus.PUBLISHED,
    });
  }

  function getHqPassageIdForSubject(subjName: string) {
    if (subjName.includes('수학') || subjName.includes('미적') || subjName.includes('기하')) return hqPassageIds[5]; // 미적분
    if (subjName.includes('확률과통계') || subjName.includes('통계') || subjName.includes('수리')) return hqPassageIds[19]; // 확률과통계
    if (subjName.includes('문학')) return hqPassageIds[3]; // 별 헤는 밤
    if (subjName.includes('국어') || subjName.includes('문법') || subjName.includes('언어') || subjName.includes('화법') || subjName.includes('의사소통')) return hqPassageIds[16]; // 국어 음운변동
    if (subjName.includes('영어') || subjName.includes('독해') || subjName.includes('어법') || subjName.includes('어휘') || subjName.includes('생활영어')) return hqPassageIds[6]; // 영어 독해
    if (subjName.includes('토익') || subjName.includes('LC') || subjName.includes('RC')) return hqPassageIds[13]; // 토익
    if (subjName.includes('한국사') && subjName.includes('근현대')) return hqPassageIds[17]; // 한국사 근현대
    if (subjName.includes('한국사') || subjName.includes('역사') || subjName.includes('세계사') || subjName.includes('동아시아')) return hqPassageIds[2]; // 한국사 전근대
    if (subjName.includes('화학')) return hqPassageIds[8]; // 화학
    if (subjName.includes('생명')) return hqPassageIds[7]; // 생명과학
    if (subjName.includes('지구과학') || subjName.includes('과학')) return hqPassageIds[9]; // 지구과학 판구조론
    if (subjName.includes('물리')) return hqPassageIds[1]; // 물리
    if (subjName.includes('경제')) return hqPassageIds[10]; // 경제 수요공급
    if (subjName.includes('정치') || subjName.includes('법') || subjName.includes('헌법')) return hqPassageIds[11]; // 법/정치
    if (subjName.includes('지리') || subjName.includes('사회') || subjName.includes('윤리') || subjName.includes('문화')) return hqPassageIds[18]; // 지리/사회
    if (subjName.includes('행정학') || subjName.includes('조직')) return hqPassageIds[14]; // 행정학
    if (subjName.includes('행정법')) return hqPassageIds[15]; // 행정법
    if (subjName.includes('NCS') || subjName.includes('능력') || subjName.includes('직업') || subjName.includes('정보')) return hqPassageIds[12]; // NCS
    return hqPassageIds[4]; // 나머지 (AI 등)
  }

  // 나머지 랜덤 지문 10개 생성 (볼륨 유지)
  for (let i = REAL_PASSAGES.length; i < 15; i++) {
    const pid = randomUUID();
    passageIds.push(pid);
    passageRows.push({
      id: pid,
      creatorId: pick(creators).id,
      generationId: chance(0.5) ? pick(genIds) : null,
      content: multiDoc(pick(REAL_PASSAGES)),
      status: chance(0.8) ? PassageStatus.PUBLISHED : PassageStatus.DRAFT,
    });
  }

  // 세트 2: 모든 소과목에 최소 1개씩 문항 배정 보장 + 해당 과목 성격에 맞는 고품질 지문 무조건 연결!
  for (const subject of subjects) {
    const qid = randomUUID();
    const r = Math.random();
    const type = r < 0.7 ? OBJECTIVE : SUBJECTIVE;
    const shortAns = type === SUBJECTIVE && r < 0.9;
    const correctIdx = randInt(0, 4);
    const correctAnswerText = type === OBJECTIVE ? null : shortAns ? pick(REAL_SHORT_ANS) : null;
    const total = randInt(0, 200);
    const correct = total ? randInt(Math.floor(total * 0.3), Math.floor(total * 0.9)) : 0;
    const stemText = pick(REAL_STEMS);
    const passageId = getHqPassageIdForSubject(subject.name);
    questions.push({ id: qid, type, correctIdx, correctAnswerText, passageId });
    questionRows.push({
      id: qid,
      creatorId: pick(creators).id,
      subjectId: subject.id, // 모든 과목 순회
      generationId: chance(0.3) ? pick(genIds) : null,
      passageId, // 100% 확률로 관련 고품질 지문 연결!
      questionType: type,
      stem: doc(stemText),
      choices: type === OBJECTIVE ? choicesArrRandom(correctIdx) : undefined,
      correctAnswerText,
      explanation: blockArray(pick(REAL_EXPLANATIONS)),
      hintContent: chance(0.5) ? pick(REAL_HINTS) : null,
      difficulty: pick(DIFF_POOL),
      points: pick([1, 1, 2, 3]),
      status: chance(0.85) ? QuestionStatus.PUBLISHED : QuestionStatus.DRAFT,
      publishedAt: new Date(),
      searchText: stemText,
      totalSolvedCount: total,
      correctSolvedCount: correct,
      viewCount: total * 3 + randInt(0, 50),
      totalTimeSpentSec: total * 70,
      timedSolvedCount: total,
    });
  }

  await chunkCreate(prisma.passage, passageRows);
  await chunkCreate(prisma.question, questionRows);
  const publishedQ = questions; // 데모 단순화: 스냅샷/문제집은 published 여부 무시하고 사용
  const objQ = questions.filter((q) => q.type === OBJECTIVE);

  // 태그 매핑 (문항당 0~3개)
  const qtRows: any[] = [];
  const qtSeen = new Set<string>();
  for (const q of questions) {
    for (const t of sample(tags, randInt(0, 3))) {
      const k = `${q.id}:${t.id}`;
      if (qtSeen.has(k)) continue;
      qtSeen.add(k);
      qtRows.push({ questionId: q.id, tagId: t.id });
    }
  }
  await chunkCreate(prisma.questionTag, qtRows);

  // 선지 분포 캐시 (객관식 일부)
  const csRows: any[] = [];
  for (const q of sample(objQ, 15)) {
    for (const cid of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      csRows.push({ questionId: q.id, choiceId: cid, count: randInt(0, 40) });
    }
  }
  await chunkCreate(prisma.questionChoiceStat, csRows);

  // --- 8. MediaAsset (~15) --------------------------------------------------
  console.log('🖼️  media_assets...');
  const mediaRows = Array.from({ length: 15 }, () => {
    const r = Math.random();
    return {
      id: randomUUID(),
      uploaderId: pick(users).id,
      assetType: MediaAssetType.IMAGE,
      storageUrl: `https://demo.supabase.co/storage/v1/object/public/media/${randomUUID()}.png`,
      widthPx: randInt(400, 1200),
      heightPx: randInt(300, 900),
      passageId: r < 0.3 ? pick(passageIds) : null,
      questionId: r >= 0.3 && r < 0.6 ? pick(questions).id : null,
      generationId: r >= 0.6 && r < 0.8 ? pick(genIds) : null,
    };
  });
  await chunkCreate(prisma.mediaAsset, mediaRows);

  // --- 9. Workbooks (~12) + WorkbookQuestion --------------------------------
  console.log('📓 workbooks...');
  const wbIds: string[] = [];
  const wbRows: any[] = [];
  const wqRows: any[] = [];
  for (let i = 0; i < 12; i++) {
    const id = randomUUID();
    wbIds.push(id);
    const picks = sample(publishedQ, randInt(5, 15));
    const attempts = randInt(0, 20);
    const wbInfo = pick(REAL_WORKBOOKS);
    wbRows.push({
      id,
      ownerId: pick(creators).id,
      title: wbInfo.title,
      description: wbInfo.desc,
      visibility: chance(0.7) ? 'PUBLIC' : 'PRIVATE',
      viewCount: randInt(0, 500),
      forkCount: randInt(0, 20),
      questionCount: picks.length,
      attemptCount: attempts,
      scoreSumPercent: attempts ? attempts * randInt(40, 90) : 0,
      publishedAt: new Date(),
    });
    picks.forEach((q, idx) => wqRows.push({ workbookId: id, questionId: q.id, displayOrder: idx + 1 }));
  }
  await chunkCreate(prisma.workbook, wbRows);
  await chunkCreate(prisma.workbookQuestion, wqRows);

  // --- 10. ExamSession + Questions + Answers (~12) --------------------------
  console.log('📝 exam_sessions...');
  const snap = (q: Q) => ({
    questionType: q.type,
    stem: doc(q.id),
    choices: q.type === OBJECTIVE ? choicesArrRandom(q.correctIdx) : undefined,
    explanation: blockArray('해설'),
    correctAnswerText: q.correctAnswerText,
    points: 1,
    difficulty: 3,
  });
  // 세션별 (userId, xp증가) 기록 → XP 원장/유저 xp 갱신에 사용
  const sessionsForXp: { userId: string; sessionId: string; gained: number }[] = [];
  // 발표용 계정 세션 5개 고정, 나머지 랜덤
  for (let i = 0; i < 15; i++) {
    const sid = randomUUID();
    const user = i < 5 ? users.find(u => u.id === targetUserId)! : pick(consumers);
    const useWb = chance(0.5);
    const wbId = useWb ? pick(wbIds) : null;
    const submitted = chance(0.75);
    const picks = sample(publishedQ, randInt(3, 6));
    await prisma.examSession.create({
      data: {
        id: sid,
        userId: user.id,
        subjectId: chance(0.5) ? pick(subjects).id : null,
        workbookId: wbId,
        isReview: chance(0.2),
        filterCriteria: { source: useWb ? 'workbook' : 'filter', questionCount: picks.length },
        status: submitted ? ExamSessionStatus.SUBMITTED : ExamSessionStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 3600_000),
        submittedAt: submitted ? new Date(Date.now() - 3000_000) : null,
        durationSec: submitted ? randInt(300, 1200) : null,
      },
    });
    const sqRows: any[] = [];
    const ansRows: any[] = [];
    let gained = 0;
    picks.forEach((q, idx) => {
      const sqId = randomUUID();
      sqRows.push({
        id: sqId,
        examSessionId: sid,
        questionId: q.id,
        displayOrder: idx + 1,
        snapshot: snap(q),
        isHintUsed: chance(0.2),
      });
      if (!submitted) return;
      // 채점: 객관식=선택 vs 정답선지, 단답=문자열, 서술형=null(자기채점 전)
      let isCorrect: boolean | null;
      let selectedChoiceIds: string[] | null = null;
      let answerText: string | null = null;
      if (q.type === OBJECTIVE) {
        const selIdx = randInt(0, 4);
        selectedChoiceIds = [`c${selIdx + 1}`];
        isCorrect = selIdx === q.correctIdx;
      } else if (q.correctAnswerText) {
        answerText = chance(0.5) ? q.correctAnswerText : '오답';
        isCorrect = answerText === q.correctAnswerText;
      } else {
        answerText = '서술형 답안 예시입니다.';
        isCorrect = null;
      }
      if (isCorrect) gained += 10;
      ansRows.push({
        id: randomUUID(),
        examSessionQuestionId: sqId,
        selectedChoiceIds,
        answerText,
        isCorrect,
        timeSpentSec: randInt(30, 180),
        answeredAt: new Date(Date.now() - 3100_000),
      });
    });
    await chunkCreate(prisma.examSessionQuestion, sqRows);
    await chunkCreate(prisma.examSessionAnswer, ansRows);
    if (submitted && gained) sessionsForXp.push({ userId: user.id, sessionId: sid, gained });
  }

  // --- 11. XpHistory + 유저 xp/level 동기화 + Milestones --------------------
  console.log('⭐ xp_history / milestones...');
  const xpRows: any[] = [];
  const balByUser = new Map<string, number>();
  for (const s of sessionsForXp) {
    const bal = (balByUser.get(s.userId) ?? 0) + s.gained;
    balByUser.set(s.userId, bal);
    xpRows.push({
      id: randomUUID(),
      userId: s.userId,
      amount: s.gained,
      reason: 'SESSION_SUBMIT',
      balanceAfter: bal,
      breakdown: { solve: s.gained },
      examSessionId: s.sessionId,
    });
  }
  await chunkCreate(prisma.xpHistory, xpRows);
  // 원장 최종 잔액으로 유저 xp/level 재동기화(있는 사용자만)
  for (const [userId, bal] of balByUser) {
    await prisma.user.update({ where: { id: userId }, data: { xp: bal, level: levelForXp(bal) } });
  }

  // 마일스톤: 각 컨슈머의 현재 xp/최장스트릭 기준 달성분 기록
  const MS_LEVEL: [string, number][] = [
    ['LEVEL_2', 100],
    ['LEVEL_3', 300],
    ['LEVEL_4', 600],
    ['LEVEL_5', 1000],
    ['LEVEL_10', 5000],
    ['LEVEL_20', 15000],
  ];
  const msRows: any[] = [];
  const freshUsers = await prisma.user.findMany({
    where: { id: { in: consumers.map((c) => c.id) } },
    select: { id: true, xp: true, longestStreak: true },
  });
  for (const u of freshUsers) {
    for (const [key, min] of MS_LEVEL) if (u.xp >= min) msRows.push({ userId: u.id, milestoneKey: key });
    if (u.longestStreak >= 7) msRows.push({ userId: u.id, milestoneKey: 'STREAK_7' });
    if (u.longestStreak >= 30) msRows.push({ userId: u.id, milestoneKey: 'STREAK_30' });
  }
  await chunkCreate(prisma.milestoneAchievement, msRows);

  // --- 12. Reviews / Comments / Annotations (~30씩) -------------------------
  console.log('💬 reviews / comments / annotations...');
  const reviewRows: any[] = [];
  const revSeen = new Set<string>();
  while (reviewRows.length < 30) {
    const q = pick(questions);
    const u = pick(consumers);
    const k = `${q.id}:${u.id}`;
    if (revSeen.has(k)) continue;
    revSeen.add(k);
    reviewRows.push({
      id: randomUUID(),
      questionId: q.id,
      reviewerId: u.id,
      rating: randInt(3, 5),
      perceivedDifficulty: randInt(1, 5),
      reviewText: pick(REAL_REVIEWS),
    });
  }
  await chunkCreate(prisma.questionReview, reviewRows);

  const commentRows = Array.from({ length: 30 }, () => ({
    id: randomUUID(),
    questionId: pick(questions).id,
    authorId: pick(consumers).id,
    content: pick(REAL_COMMENTS),
  }));
  await chunkCreate(prisma.questionComment, commentRows);

  const REASONS = ['CONCEPT', 'MISTAKE', 'TIME', 'OTHER'];
  const annoRows = Array.from({ length: 40 }, (_, i) => {
    const q = pick(questions);
    const target = pick(['STEM', 'CHOICES', 'PASSAGE', 'EXPLANATION']);
    let targetId = null;
    if (target === 'CHOICES') targetId = pick(['c1', 'c2', 'c3', 'c4', 'c5']);
    if (target === 'PASSAGE') targetId = q.passageId;

    return {
      id: randomUUID(),
      userId: i < 15 ? targetUserId : pick(consumers).id, // 앞쪽 15개는 발표용 계정에 몰아주기
      questionId: q.id,
      target,
      targetId,
      markStyle: pick(['HIGHLIGHT', 'UNDERLINE']),
      color: pick(['yellow', 'pink', 'blue', 'green']),
      selectedText: pick(REAL_ANNOTATION_TEXTS),
      reasonCode: pick(REASONS),
      memoText: pick(REAL_ANNOTATION_MEMOS),
    };
  });
  await chunkCreate(prisma.userQuestionAnnotation, annoRows);

  // --- 요약 ----------------------------------------------------------------
  const c = {
    users: users.length,
    subjects: subjectRows.length,
    tags: tagRows.length,
    aiGenerations: genRows.length,
    passages: passageRows.length,
    questions: questionRows.length,
    workbooks: wbRows.length,
    reviews: reviewRows.length,
  };
  console.log('✅ seed done', c);
  console.log(`   로그인: admin@ / creator@ / consumer@demo.io  (pw: ${DEMO_PASSWORD})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
