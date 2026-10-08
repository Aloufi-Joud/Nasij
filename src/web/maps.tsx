// Web stand-in for react-native-maps: a plain box instead of the map
import { Text, View } from 'react-native';

export default function MapView({ style }: { style?: object }) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' }, style]}>
      <Text>Map is phone-only</Text>
    </View>
  );
}
export const Circle = () => null;
export const Marker = () => null;
