import { AppListRow } from "./ui/AppListRow";

type Props = {
  label: string;
  icon: string;
  onPress: () => void;
  active?: boolean;
};

export function NavMenuRow({ label, icon, onPress, active }: Props) {
  return (
    <AppListRow
      title={label}
      icon={icon}
      onPress={onPress}
      active={active}
      showChevron
    />
  );
}
