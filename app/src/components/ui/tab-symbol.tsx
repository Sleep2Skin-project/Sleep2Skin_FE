import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

type TabSymbolProps = {
  sf: SFSymbol;
  android: MaterialIconName;
  size?: number;
  weight?: SymbolWeight;
  tintColor?: string;
  style?: { transform?: ViewStyle['transform'] };
};

// expo-symbols(SDK54)는 iOS SF Symbols만 지원하므로, Android/Web은 @expo/vector-icons의
// MaterialIcons로 같은 의미의 아이콘을 대신 그린다.
export function TabSymbol({ sf, android, size = 22, weight, tintColor, style }: TabSymbolProps) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView name={sf} size={size} weight={weight} tintColor={tintColor} style={style as ViewStyle} />
    );
  }

  return <MaterialIcons name={android} size={size} color={tintColor} style={style as TextStyle} />;
}
