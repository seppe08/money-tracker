import { StyleSheet, Text } from 'react-native';

import { colors } from '@/theme/colors';

type FormErrorProps = {
  message: string | null;
};

export function FormError({ message }: FormErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <Text accessibilityRole="alert" style={styles.text}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
});
