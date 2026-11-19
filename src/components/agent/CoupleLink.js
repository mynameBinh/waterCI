// =============================================================================
// CoupleLink — màn liên kết ban đầu của Cặp đôi (chưa liên kết / đang chờ người kia).
// Mục tiêu: bớt khô khan — có minh hoạ tim đôi (hai agent còn xa nhau), giải thích ngắn "cả hai cùng nhập tên của nhau",
// và trạng thái "đang chờ" có hình người kia mờ đi.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "../Avatar";
import { Btn, Input } from "./AgentHomeCards";
import CoupleHeart from "./CoupleHeart";

const STEPS = [
  "Bạn nhập tên đăng nhập của người kia.",
  "Bạn ấy cũng nhập tên đăng nhập của bạn trong mục Cặp đôi.",
  "Khi cả hai đã nhập, hai bạn thấy nhau và giữ chuỗi chung.",
];

export const LinkIntro = ({ colors, couple, myName }) => {
  const { busy, err, link } = couple;
  const [partner, setPartner] = useState("");
  const [share, setShare] = useState(true);
  return (
    <View>
      <CoupleHeart colors={colors} mood="flat" partnerName="?" partnerDim celebrate={false} />
      <Text style={[styles.title, { color: colors.text }]}>Cùng nhau giữ nhịp</Text>
      <Text style={[styles.msg, { color: colors.textMuted, textAlign: "center" }]}>
        Xem tiến độ của nhau, giữ chuỗi chung và trả lời câu hỏi mỗi ngày. Cả hai cùng nhập tên của nhau thì mới liên kết.
      </Text>
      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepNum, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.stepNumText, { color: colors.primaryText }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.msg, { color: colors.text, flex: 1 }]}>{s}</Text>
          </View>
        ))}
      </View>
      <View style={styles.formRow}>
        <Input colors={colors} value={partner} onChangeText={setPartner} placeholder="Tên đăng nhập của người kia"
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} accessibilityLabel="Tên đăng nhập của người kia" />
        <Btn colors={colors} label="Liên kết" onPress={() => link(partner, share)} busy={busy} disabled={partner.trim().length < 2} />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.msg, { color: colors.text, flex: 1 }]}>Cho người kia xem tiến độ uống nước của mình</Text>
        <Switch value={share} onValueChange={setShare} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#ffffff"
          accessibilityLabel="Cho người kia xem tiến độ" />
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>Bạn có thể đổi lựa chọn này bất cứ lúc nào trong mục Tuỳ chỉnh.</Text>
      {!!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 8 }]}>{err}</Text>}
      {!!myName && <Text style={[styles.hint, { color: colors.textMuted, marginTop: 8 }]}>Tên đăng nhập của bạn là “{myName}”, bạn ấy sẽ nhập đúng tên này.</Text>}
    </View>
  );
};

export const LinkWaiting = ({ colors, couple, myName }) => {
  const { c, busy, err, unlink } = couple;
  const confirm = () =>
    Alert.alert("Huỷ liên kết?", `Bạn sẽ ngừng chờ ${c.partner_username}. Bạn có thể liên kết lại bất cứ lúc nào.`, [
      { text: "Giữ lại", style: "cancel" },
      { text: "Huỷ liên kết", style: "destructive", onPress: unlink },
    ]);
  return (
    <View>
      <CoupleHeart colors={colors} mood="flat" partnerName={c.partner_username} partnerDim celebrate={false} />
      <View style={styles.waitRow}>
        <View style={{ opacity: 0.4 }}>
          <Avatar name={c.partner_username} size={44} ringColor={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.waitTitle, { color: colors.text }]}>Đang chờ {c.partner_username}</Text>
          <Text style={[styles.msg, { color: colors.textMuted }]}>
            Bạn ấy cần mở mục Cặp đôi và nhập tên đăng nhập của bạn{myName ? ` (“${myName}”)` : ""} để hoàn tất liên kết.
          </Text>
        </View>
      </View>
      <View style={styles.tip}>
        <Ionicons name="paper-plane-outline" size={15} color={colors.textMuted} />
        <Text style={[styles.hint, { color: colors.textMuted, flex: 1 }]}>Gửi cho bạn ấy một tin nhắn để nhắc nhé, liên kết sẽ tự cập nhật khi bạn ấy xong.</Text>
      </View>
      <Btn colors={colors} ghost label="Huỷ liên kết" onPress={confirm} busy={busy} style={styles.fullBtn} />
      {!!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 8 }]}>{err}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "800", textAlign: "center", marginTop: 6, marginBottom: 6 },
  msg: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  steps: { marginTop: 14, gap: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 12.5, fontWeight: "800" },
  formRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 16 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  waitRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  waitTitle: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  tip: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12 },
  fullBtn: { width: "100%", marginTop: 14 },
});
