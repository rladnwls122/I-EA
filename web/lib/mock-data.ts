export type Question = { 
  id: any; 
  title: string; 
  body: string; 
  subject: string; 
  type: string; 
  difficulty: any; 
  tags: string[]; 
  wrong?: boolean 
};

export const questions: Question[] = [
  { id: 1, title: "현대시의 화자와 태도", body: "다음 시에서 화자의 정서와 태도를 가장 적절하게 설명한 것은?", subject: "문학", type: "객관식", difficulty: "중", tags: ["현대시", "화자"], wrong: true },
  { id: 2, title: "문장 성분의 호응", body: "밑줄 친 부분 중 문장 성분의 호응이 자연스럽지 않은 것을 고르시오.", subject: "언어와 매체", type: "객관식", difficulty: "하", tags: ["문법", "문장성분"], wrong: true },
  { id: 3, title: "함수의 극값과 증가", body: "함수 f(x)의 증가와 감소를 고려하여 극값을 구하시오.", subject: "미적분", type: "주관식", difficulty: "상", tags: ["미분", "극값"] },
  { id: 4, title: "고전소설의 서술상 특징", body: "<보기>를 바탕으로 작품의 서술상 특징을 파악한 내용으로 적절한 것은?", subject: "문학", type: "객관식", difficulty: "상", tags: ["고전소설", "서술"], wrong: true },
  { id: 5, title: "자료 해석의 원리", body: "그래프 자료를 해석한 내용으로 옳은 것을 모두 고르시오.", subject: "사회·문화", type: "객관식", difficulty: "중", tags: ["자료해석"] },
  { id: 6, title: "확률의 덧셈정리", body: "두 사건 A, B에 대하여 P(A∪B)를 구하시오.", subject: "확률과 통계", type: "주관식", difficulty: "중", tags: ["확률"] },
];

export const choices = ["화자는 대상에 대한 그리움과 기다림의 정서를 드러내고 있다.", "화자는 대상의 부정적 모습을 냉소적으로 비판하고 있다.", "화자는 자신의 처지를 비관하며 현실을 회피하고 있다.", "화자는 미래에 대한 확신으로 현재를 극복하려 한다."];
