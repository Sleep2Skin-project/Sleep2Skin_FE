import { useSyncExternalStore } from 'react';

// TODO 체크리스트 토글(PATCH /api/v1/todo/{id})이 성공하면 exp/레벨과 "오늘의 투두 n/5"가
// 함께 바뀐다. 이 값을 보여주는 HOME(index.tsx)과 MY(my.tsx)는 todo.tsx의 형제 탭 화면이라
// props로 알려줄 방법이 없고, 세 화면 다 useEffect([])로 마운트 시 한 번만 조회해서 탭을
// 옮겨도 갱신되지 않았다(탭 네비게이터는 화면을 언마운트하지 않고 계속 마운트해둠). 그래서
// use-account-reset-signal.ts와 동일한 useSyncExternalStore 신호 패턴으로, 토글이 성공할
// 때마다 신호를 보내고 HOME/MY가 그 신호를 구독해 자기 프로필/투두 데이터를 다시 조회한다.
//
// boolean이 아니라 매번 증가하는 카운터를 신호로 쓴다 — boolean이면 이미 true인 상태에서 또
// 신호를 보내도 값이 안 바뀌어 구독자의 useEffect가 재실행되지 않는다.
let signalCount = 0;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function signalTodoChanged() {
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

/** 값이 바뀔 때마다(=체크리스트 토글이 성공할 때마다) 구독자에게 재렌더를 알린다. */
export function useTodoChangedSignal(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
