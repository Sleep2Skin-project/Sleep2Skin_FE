import { useSyncExternalStore } from 'react';

import { TODO_SUMMARY_MOCK } from '@/constants/mockData';

// TODO(오늘 밤 체크리스트) 완료 상태를 화면 간에 실시간으로 공유하는 최소 store.
// todo.tsx가 로컬 useState로만 들고 있으면 MY(my.tsx)의 "오늘의 투두 n/5" 요약이 todo 탭을
// 안 열어보면 갱신되지 않는다 — 두 화면(그리고 앞으로 이 값을 쓸 다른 화면)이 같은 상태를
// 봐야 해서, 외부 라이브러리(zustand 등) 없이 React 18의 useSyncExternalStore로 아주 작은
// 전역 store를 만든다. 백엔드 API가 생기면 이 모듈 전체를 그 응답 기반 상태로 교체할 것.
type CheckedMap = Record<string, boolean>;

let checkedMap: CheckedMap = Object.fromEntries(
  TODO_SUMMARY_MOCK.checklist.map((item) => [item.id, item.checked]),
);
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function toggleChecklistItem(id: string) {
  checkedMap = { ...checkedMap, [id]: !checkedMap[id] };
  emitChange();
}

/**
 * MY-04(회원 탈퇴) 성공 시 호출한다 — 삭제된 사용자의 체크 상태가 다음 사용자(재가입 등)에게
 * 그대로 남아있으면 안 되므로 완전히 비운다. 다른 로컬 스토어가 이 앱에 추가되면 그것도 같이
 * 초기화 대상에 넣을 것.
 */
export function resetChecklistStore() {
  checkedMap = {};
  emitChange();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return checkedMap;
}

export function useChecklistCheckedMap(): CheckedMap {
  return useSyncExternalStore(subscribe, getSnapshot);
}
