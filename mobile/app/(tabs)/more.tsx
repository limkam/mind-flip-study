import { usePathname, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NavMenuRow } from "../../components/NavMenuRow";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { useLogout } from "../../hooks/useLogout";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { APP_NAV_ITEMS } from "../../lib/navigation";

function isNavActive(pathname: string, href: string) {
  if (href === "/(tabs)") {
    return pathname === "/" || pathname === "/index" || pathname.endsWith("/index");
  }
  return pathname === href || pathname.endsWith(href.split("/").pop() ?? "");
}

export default function MoreTab() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { confirmLogout } = useLogout();

  return (
    <Screen>
      <PageHeader title="Menu" subtitle="Same sections as the web app" />
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {APP_NAV_ITEMS.map((item) => {
          const href = typeof item.href === "string" ? item.href : String(item.href);

          return (
            <NavMenuRow
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={isNavActive(pathname, href)}
              onPress={() => router.push(item.href)}
            />
          );
        })}
        <Pressable
          style={[styles.logoutBtn, { borderColor: colors.danger, backgroundColor: colors.surface }]}
          onPress={() => {
            void hapticImpact("light");
            confirmLogout();
          }}
        >
          <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
        </Pressable>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            FlashLearn · MindFlip mobile
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  logoutBtn: {
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: { fontSize: 15, fontWeight: "700" },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    alignItems: "center",
  },
  footerText: { fontSize: 12 },
});
