import { ScreenHeader } from "./ui/ScreenHeader";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
};

export function PageHeader({ title, subtitle, showBack, onBack }: Props) {
  return (
    <ScreenHeader
      title={title}
      subtitle={subtitle}
      showBack={showBack}
      onBack={onBack}
    />
  );
}
