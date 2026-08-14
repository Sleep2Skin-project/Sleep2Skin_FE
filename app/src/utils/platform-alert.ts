import { Alert, Platform } from "react-native";

type PlatformAlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

// react-native-web의 Alert.alert()는 완전 no-op이라(버튼도 없고 onPress도 호출되지 않음), 그걸
// 몰랐던 호출부는 웹에서 에러 알림이 조용히 사라진다 — 특히 알림의 onPress가 유일한 복구 경로일 때
// (예: rollbackToCapture) 화면이 그대로 멈춘 것처럼 보인다. 네이티브에서는 기존 Alert.alert 그대로,
// 웹에서는 window.alert/confirm으로 대체해 onPress가 항상 호출되도록 한다.
export function showAlert(title: string, message?: string, buttons?: PlatformAlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }

  if (buttons.length === 1) {
    window.alert(text);
    buttons[0].onPress?.();
    return;
  }

  const cancelButton = buttons.find((button) => button.style === "cancel") ?? buttons[buttons.length - 1];
  const confirmButton = buttons.find((button) => button !== cancelButton) ?? buttons[0];
  if (window.confirm(text)) {
    confirmButton.onPress?.();
  } else {
    cancelButton.onPress?.();
  }
}
