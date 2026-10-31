import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/theme/tokens';

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }, tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6, backgroundColor: '#FFFFFF', borderTopColor: colors.border, elevation: 10 } }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Text style={{color, fontSize: 19}}>⌂</Text> }} />
    <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: ({ color }) => <Text style={{color, fontSize: 17}}>▣</Text> }} />
    <Tabs.Screen name="analytics" options={{ title: 'Graphs', tabBarIcon: ({ color }) => <Text style={{color, fontSize: 17}}>▥</Text> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Text style={{color, fontSize: 18}}>♙</Text> }} />
  </Tabs>;
}
