import { type TextInputProps, type StyleProp, type ViewStyle } from "react-native";

import { AppTextInput } from "./ui/AppTextInput";

type Props = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
  label?: string;
  error?: string;
};

export function PasswordInput({ containerStyle, label, error, ...props }: Props) {
  return (
    <AppTextInput
      {...props}
      isPassword
      label={label}
      error={error}
      containerStyle={containerStyle}
    />
  );
}
