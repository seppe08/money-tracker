import { Stack } from 'expo-router';

import { colors } from '@/theme/colors';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="profile" />
      <Stack.Screen
        name="add"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="transaction/[id]"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
    </Stack>
  );
}
