import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NavMenuRow } from "../../components/NavMenuRow";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { useLogout } from "../../hooks/useLogout";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { mobileFeatures } from "../../lib/featureFlags";
import { APP_NAV_ITEMS } from "../../lib/navigation";
import { fetchEntitlementsSnapshot } from "../../lib/billing";

import { subscriptionsEnabled } from "../../lib/billing";

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
  const { data: entitlements, isError: entitlementsError } = useQuery({ queryKey: ["billing-entitlements"], queryFn: fetchEntitlementsSnapshot });
  const isFree = !entitlements?.plan_slug || entitlements.plan_slug === "free";
  const isSubscriptionsEnabled = subscriptionsEnabled();

  const visibleNavItems = APP_NAV_ITEMS.filter((item) => {
    const href = typeof item.href === "string" ? item.href : String(item.href);
    if (href === "/pricing" && !isSubscriptionsEnabled) return false;
    if (!item.feature) return true;
    if (item.feature === "scorecards") return mobileFeatures.scorecards;
    return !entitlementsError && entitlements?.features[item.feature] === true;
  });

  return (
    <Screen>
      <PageHeader title="Menu" subtitle="Same sections as the web app" />
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => {
            void hapticImpact("medium");
            router.push(!isSubscriptionsEnabled ? "/billing" : isFree ? "/pricing" : "/billing");
          }}
          style={styles.upgradeCard}
        >
          <View style={styles.upgradeGlow} />
          <View style={styles.upgradeIcon}>
            <Ionicons
              name={!isSubscriptionsEnabled ? "card" : isFree ? "rocket" : "diamond"}
              size={23}
              color="#5b21b6"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>
              {!isSubscriptionsEnabled ? "Billing & Credits" : isFree ? "Upgrade MindFlip" : "Manage your plan"}
            </Text>
            <Text style={styles.upgradeText}>
              {!isSubscriptionsEnabled
                ? "View credit balances, usage and history"
                : isFree
                ? "Unlock more books, cards and study features"
                : `${entitlements?.plan_slug?.replace(/_/g, " ")} plan · View credits and billing`}
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={27} color="#fff" />
        </Pressable>
        {visibleNavItems.map((item) => {
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
            MindFlip mobile
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  upgradeCard: { minHeight: 116, borderRadius: 24, padding: 17, marginBottom: 18, backgroundColor: "#6437d7", flexDirection: "row", alignItems: "center", gap: 13, overflow: "hidden", shadowColor: "#5b21b6", shadowOffset: { width: 0, height: 10 }, shadowOpacity: .24, shadowRadius: 18, elevation: 7 },
  upgradeGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75, right: -50, top: -75, backgroundColor: "#ec489944" },
  upgradeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  upgradeTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  upgradeText: { color: "#ffffffbf", fontSize: 11, lineHeight: 16, marginTop: 3, textTransform: "capitalize" },
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
