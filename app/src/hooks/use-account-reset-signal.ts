import { useSyncExternalStore } from 'react';

// MY-04(회원 탈퇴, DELETE /api/v1/users/me) 성공 신호 — my.tsx(탭 안쪽 깊은 화면)가 루트
// 레이아웃(_layout.tsx)에게 "온보딩/동의 화면으로 강제로 돌아가라"고 알리는 최소 store.
// _layout.tsx는 my.tsx의 부모가 아니라 조상(& 그 사이에 (tabs) 스택이 껴 있음)이라 props로
// 직접 콜백을 내려줄 방법이 없어, use-checklist-store.ts와 동일한 useSyncExternalStore 패턴을
// 재사용한다.
//
// boolean이 아니라 매번 증가하는 카운터를 신호로 쓴다 — boolean이면 이미 true인 상태에서 다시
// signal()을 불러도 값이 안 바뀌어 구독자의 useEffect가 재실행되지 않는다(예: 삭제 후 재가입한
// 같은 세션에서 또 탈퇴하는 극단적 케이스도 놓치지 않기 위함).
let signalCount = 0;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function signalAccountDeleted() {
  signalCount += 1;
  emitChange();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return signalCount;
}

/** 0이면 아직 삭제 신호 없음. 값이 바뀔 때마다(=매번 새로운 삭제 이벤트) 구독자에게 재렌더를 알린다. */
export function useAccountDeletedSignal(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
