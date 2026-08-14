// app/src/constants/mockData.ts
// 백엔드 API가 아직 없어 HOME/TODO 화면에서 쓰는 콘텐츠 데이터를 실제 응답과 유사한
// 형태(Object/JSON)로 분리해둔 목업. 추후 API가 준비되면 이 모듈만 교체하면 된다.

// ── HOME (GET /home/summary 예상) ─────────────────────────────────────────

export type SkinRiskLevel = 'danger' | 'warning' | 'success';

export interface SkinForecastItem {
  key: string;
  label: string;
  value: number;
  status: string;
  riskLevel: SkinRiskLevel;
}

export interface HomeSummaryResponse {
  date: {
    label: string;
  };
  greeting: {
    message: string;
    emoji: string;
  };
  level: {
    current: number;
    progressPercent: number;
    // "50/250 exp" (node 541:3482) — 게이미케이션 API가 아직 없어 하드코딩. API 연동 시 이 값과
    // progressPercent를 함께 서버 응답으로 교체할 것.
    exp: {
      current: number;
      max: number;
    };
  };
  sleepSummary: {
    tooltipLines: string[];
  };
  skinForecast: {
    title: string;
    disclaimer: string;
    items: SkinForecastItem[];
  };
}

// ============================================================================
// TODO(게이미케이션 API 연동 시 여기부터): 캐릭터 레벨/exp는 지금 전부 하드코딩된 목업이다.
// 백엔드에 게이미케이션 API(레벨/exp 조회)가 아직 없어서 임시로 "레벨4 고정" 상태만 보여주고
// 있다 — 실제 유저별 레벨은 반영되지 않는다. API가 생기면 할 일:
//   1. HOME_SUMMARY_MOCK.level을 지우고, index.tsx의 forecastState/interpretationState와 같은
//      패턴으로 API 응답을 담는 state를 만들어 GET 요청 결과로 채운다.
//   2. src/app/index.tsx의 "캐릭터" 섹션(figma-character.png를 그대로 require하는 부분,
//      "캐릭터" 주석으로 검색하면 찾을 수 있음)에서, 레벨 숫자로 아래 5개 이미지 중 하나를
//      고르는 매핑(예: LEVEL_CHARACTER_IMAGES[level] 같은 record)을 만들어 넣는다.
//      레벨별 캐릭터 원본은 app/assets/images/figma-character-level-1.png ~ -5.png에 이미
//      저장돼 있다(Figma 'Ui (복사)' 파일에서 레벨1~5 홈 화면 프레임별로 추출한 것 — 레벨4는
//      기존에 쓰던 figma-character.png와 픽셀 동일 이미지라 별도 교체 없이 그대로 매핑에
//      꽂아도 됨).
//   3. exp.current는 API가 주는 실제 값으로 교체한다(지금은 "1/100처럼 보이면 초라하다"는
//      이유로 레벨과 무관하게 50을 하드코딩해 둔 것 — 진짜 값이 아니다. 아래 LEVEL_EXP_MAX 참고).
//   4. progressPercent는 Figma가 레벨 프레임마다 디자이너 감으로 따로 지정한 픽셀값이라
//      (레벨1:19, 2:34, 3:52, 4:34, 5:34 / 트랙폭 95.4px) exp 비율과 안 맞는다 — API 연동 시
//      실제 진행률(exp.current / exp.max)로 계산할지, 디자인 그대로 둘지 기획 쪽에 재확인 필요.
// ============================================================================

// 레벨업마다 필요 exp가 50씩 늘어나는 구조(기획 확정값): 레벨1=100, 레벨2=150, 레벨3=200,
// 레벨4=250, 레벨5=300 (= 100 + (레벨-1) * 50). MY 탭(my.tsx)의 레벨 구간 막대(EXP bar, "^" 표시가
// 레벨 경계)가 이 테이블의 키 개수(=LEVEL_COUNT, 캐릭터 이미지도 1~5 다섯 종뿐)로 칸 수를 정하므로
// export한다.
export const LEVEL_EXP_MAX: Record<number, number> = {
  1: 100,
  2: 150,
  3: 200,
  4: 250,
  5: 300,
};

export const HOME_SUMMARY_MOCK: HomeSummaryResponse = {
  date: { label: '8월 6일 목요일' },
  greeting: { message: '좋은 아침이에요', emoji: '🌞' },
  // 평소 홈 화면 기본값은 레벨4로 유지("홈 화면"(node 541:2746) 기준, 34/95.4·250exp). 위 TODO
  // 블록 참고 — API 연동 전까지는 이 고정값(레벨4/50exp)만 보여준다.
  level: { current: 4, progressPercent: (34 / 95.4) * 100, exp: { current: 50, max: LEVEL_EXP_MAX[4] } },
  sleepSummary: { tooltipLines: ['깊은 수면이', '32분 부족했어요'] },
  skinForecast: {
    title: '오늘의 피부 예보',
    disclaimer: '예보는 확정이 아닌 위험 지수입니다. 식단·날씨·스킨케어도 함께 작용해요.',
    items: [
      { key: 'oil', label: '유분', value: 78, status: '과다', riskLevel: 'warning' },
      { key: 'darkCircle', label: '다크서클', value: 41, status: '위험', riskLevel: 'danger' },
      { key: 'dullness', label: '칙칙함', value: 55, status: '보통', riskLevel: 'success' },
    ],
  },
};

// ── TODO (GET /todo/summary 예상) ──────────────────────────────────────────

export interface AvoidListItem {
  id: string;
  title: string;
  reason: string;
  // ============================================================================
  // TODO(투두리스트 API 연동 시 여기부터): "오늘은 피하세요" 항목을 탭하면 뜨는 상세 모달
  // (AvoidDetailModal, src/app/todo.tsx, Figma node 541:3131) 전용 필드 — 지금은 API가 없어
  // 전부 하드코딩이다. 백엔드에 항목별 설명 API가 생기면 이 3개 필드를 서버 응답으로 교체할 것.
  // 'exfoliation'(강한 각질 제거)만 Figma가 실제 모달 디자인을 제공해 그 문구를 그대로 옮겼고,
  // 나머지 두 항목(new-product/phone-before-bed)은 디자인이 없어 위 title/reason을 바탕으로
  // 임시로 작성한 자리표시자 문구다 — 실제 서비스 문구가 정해지면 반드시 교체할 것.
  // ============================================================================
  detail: {
    // 모달 상단 배지 아래 순위 라벨 ("OOO의 원인 # N", node 541:3137)
    rankLabel: string;
    // 본문 설명 문장 (node 541:3138) — 하나의 문장이다. Figma는 이걸 손으로 미리 3줄로
    // 쪼개 각 줄 앞에 공백을 넣어 "- " 다음 줄부터 들여쓰기를 흉내 냈지만, 그 방식은 실제
    // 렌더 폭이 조금만 달라져도(제목이 다르거나 폭이 안 맞으면) 자동 줄바꿈이 한 번 더 일어나
    // 줄마다 시작 위치가 어긋난다. 그래서 문자열은 줄바꿈 없는 순수 문장으로 두고, 렌더링
    // 쪽(AvoidDetailModal)에서 "-" 열과 문장 열을 나눠 행잉 인덴트로 처리한다.
    description: string;
    // 하단 한 줄 멘트 (node 541:3139)
    footer: string;
  };
}

export interface ChecklistItemResponse {
  id: string;
  title: string;
  checked: boolean;
  /** "+ 5 exp" 같은 경험치 배지 문구. Figma 시안엔 맨 위 항목에만 예시로 붙어 있어 옵셔널. */
  expLabel?: string;
}

export interface TodoSummaryResponse {
  avoidList: AvoidListItem[];
  checklist: ChecklistItemResponse[];
}

export const TODO_SUMMARY_MOCK: TodoSummaryResponse = {
  avoidList: [
    {
      id: 'exfoliation',
      title: '강한 각질 제거',
      reason: '혈색 저하의 원인',
      // Figma 모달 디자인(node 541:3131) 문구 그대로.
      detail: {
        rankLabel: '피부장벽 저하의 원인 # 1',
        description: '과도한 각질 제거는 피부를 자극하고 장벽을 약하게 만들 수 있어요',
        footer: '피부를 위해 피해주세요.',
      },
    },
    {
      id: 'new-product',
      title: '새 제품 첫 사용',
      reason: '피부 장벽 저하의 원인',
      // Figma에 이 항목의 모달 디자인은 없어 위 reason을 바탕으로 임시 작성 — API 연동 시 교체.
      detail: {
        rankLabel: '피부 장벽 저하의 원인 # 1',
        description: '검증되지 않은 새 성분은 피부 장벽을 자극하고 트러블을 유발할 수 있어요',
        footer: '피부를 위해 피해주세요.',
      },
    },
    {
      id: 'phone-before-bed',
      title: '취침 전 스마트폰 장시간 사용',
      reason: '다크서클의 원인',
      // Figma에 이 항목의 모달 디자인은 없어 위 reason을 바탕으로 임시 작성 — API 연동 시 교체.
      detail: {
        rankLabel: '다크서클의 원인 # 1',
        description: '취침 전 블루라이트는 멜라토닌 분비를 방해해 다크서클을 악화시킬 수 있어요',
        footer: '피부를 위해 피해주세요.',
      },
    },
  ],
  checklist: [
    { id: 'caffeine-cutoff-1', title: '카페인 컷오프 15:00', checked: true, expLabel: '+ 5 exp' },
    { id: 'screen-off-1', title: '취침 30분 전 화면 끄기', checked: false },
    { id: 'room-temp', title: '침실 온도 19–21°C', checked: false },
    { id: 'caffeine-cutoff-2', title: '카페인 컷오프 15:00', checked: true },
    { id: 'screen-off-2', title: '취침 30분 전 화면 끄기', checked: false },
  ],
};
