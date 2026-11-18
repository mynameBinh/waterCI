// =============================================================================
// CoupleSheet — chức năng "Cặp đôi" cho tab "Tôi":
//   - useCouple(api): tải / làm mới trạng thái liên kết + các hành động
//     (liên kết, huỷ liên kết, bật/tắt chia sẻ, trả lời câu hỏi mỗi ngày).
//   - CoupleSheetBody: nội dung bảng trượt từ dưới lên (đặt trong PickerSheet của ProfileTab).
// Dòng tóm tắt ở danh sách cài đặt dùng couple.summary / couple.needsAttention.
// Tự gọi API (qua `api` của useAgentApi), không phụ thuộc state của Dashboard.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Btn, Input, useRefreshOnActive } from "./AgentHomeCards";
import CoupleHeart from "./CoupleHeart";
import FlameStreak from "./FlameStreak";

export function useCouple(api, enabled = true) {
  const [c, setC] = useState(null);
  const [failed, setFailed] = useState(false); // lần tải gần nhất lỗi (mất mạng / server chưa có API)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await api("/api/couple/status");
      if (mounted.current) {
        setC(r);
        setFailed(false);
      }
    } catch {
      if (mounted.current) setFailed(true); // giữ nguyên dữ liệu cũ nếu có
    }
  }, [api, enabled]);
  useRefreshOnActive(load);

  // Chạy một hành động rồi tải lại trạng thái; trả về true nếu thành công
  const act = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      if (mounted.current) setErr(e.message);
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const put = (body) => api("/api/couple/link", { method: "PUT", body: JSON.stringify(body) });

  const link = (partner, share) => act(() => put({ partner_username: partner.trim(), share_progress: share }));
  const unlink = () => act(() => put({ partner_username: null }));
  const setShareProgress = (on) => act(() => put({ partner_username: c.partner_username, share_progress: on }));
  const sendAnswer = (text) => act(() => api("/api/couple/daily", { method: "POST", body: JSON.stringify({ text }) }));

  // Dòng tóm tắt hiện ở danh sách cài đặt
  let summary = failed ? "Chưa kết nối được" : "Đang tải…";
  if (c) {
    if (!c.partner_username) summary = "Chưa liên kết";
    else if (!c.linked) summary = `Đang chờ ${c.partner_username}`;
    else if (c.visible && c.joint_streak > 0) summary = `${c.partner_username} · ${c.joint_streak} ngày`;
    else summary = c.partner_username;
  }
  // Có câu hỏi hôm nay mà mình chưa trả lời -> chấm nhỏ trên icon
  const needsAttention = !!(c?.linked && c.question && !c.my_answer);

  return { c, summary, needsAttention, busy, err, failed, reload: load, link, unlink, setShareProgress, sendAnswer };
}

const SwitchRow = ({ colors, label, value, onValueChange, disabled }) => (
  <View style={styles.switchRow}>
    <Text style={[styles.msg, { color: colors.text, flex: 1 }]}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor="#ffffff"
    />
  </View>
);

// avatars: { myName, mySource, myUri, partnerSource } do ProfileTab truyền xuống (ảnh người kia lấy từ server)
export const CoupleSheetBody = ({ colors, couple, avatars = {} }) => {
  const { c, busy, err, failed, reload, link, unlink, setShareProgress, sendAnswer } = couple;
  const [partner, setPartner] = useState("");
  const [share, setShare] = useState(true);
  const [answer, setAnswer] = useState("");
  const errNode = !!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 8 }]}>{err}</Text>;

  // Chưa có dữ liệu: đang tải, hoặc lỗi
  if (!c) {
    return failed ? (
      <View>
        <Text style={[styles.msg, { color: colors.textMuted }]}>
          Chưa tải được thông tin cặp đôi. Kiểm tra kết nối rồi thử lại nhé.
        </Text>
        <Btn colors={colors} ghost label="Thử lại" onPress={reload} style={styles.fullBtn} />
      </View>
    ) : (
      <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
    );
  }

  // 1) Chưa liên kết
  if (!c.partner_username) {
    return (
      <View>
        <Text style={[styles.msg, { color: colors.textMuted }]}>
          Liên kết với người kia để xem tiến độ của nhau, giữ chuỗi chung và trả lời câu hỏi mỗi ngày. Cả hai cùng nhập
          tên đăng nhập của nhau thì mới liên kết.
        </Text>
        <View style={styles.formRow}>
          <Input
            colors={colors}
            value={partner}
            onChangeText={setPartner}
            placeholder="Tên đăng nhập của người kia"
            autoCapitalize="none"
            style={{ flex: 1 }}
          />
          <Btn
            colors={colors}
            label="Liên kết"
            onPress={() => link(partner, share)}
            busy={busy}
            disabled={partner.trim().length < 2}
          />
        </View>
        <SwitchRow
          colors={colors}
          label="Cho người kia xem tiến độ uống nước của mình"
          value={share}
          onValueChange={setShare}
        />
        {errNode}
      </View>
    );
  }

  // 2) Đã nhập tên, đang chờ người kia
  if (!c.linked) {
    return (
      <View>
        <CoupleHeart colors={colors} mood="flat" myName={avatars.myName} mySource={avatars.mySource}
          myUri={avatars.myUri} partnerName={c.partner_username} />
        <Text style={[styles.msg, { color: colors.text }]}>
          Đang chờ {c.partner_username} nhập tên đăng nhập của bạn để hoàn tất liên kết.
        </Text>
        <Btn colors={colors} ghost label="Huỷ liên kết" onPress={unlink} busy={busy} style={styles.fullBtn} />
        {errNode}
      </View>
    );
  }

  // 3) Đã liên kết
  const p = c.partner;
  const pct = p ? Math.min(100, Math.round((p.water_ml / Math.max(1, p.water_goal)) * 100)) : 0;
  const status = p?.day_complete ? " · xong hôm nay" : p?.pending_tasks ? ` · còn ${p.pending_tasks} việc` : "";
  const mood = c.visible && p ? (c.me?.day_complete && p.day_complete ? "happy" : "calm") : "flat";
  const caption =
    mood === "happy"
      ? "Cả hai đã xong hôm nay 💗"
      : mood === "calm"
        ? ""
        : "Chưa xem được nhịp của nhau";
  return (
    <View>
      <CoupleHeart colors={colors} mood={mood} myName={avatars.myName} mySource={avatars.mySource}
        myUri={avatars.myUri} partnerName={c.partner_username} partnerSource={avatars.partnerSource} />
      <Text style={[styles.caption, { color: colors.textMuted }]}>{caption}</Text>
      <View style={[styles.panel, { backgroundColor: colors.background }]}>
        <View style={styles.panelHead}>
          <Text style={[styles.panelTitle, { color: colors.text }]} numberOfLines={1}>
            {p?.name || c.partner_username}
          </Text>
          {c.visible && c.joint_streak > 0 && (
            <FlameStreak count={c.joint_streak} size={14} label="ngày chung" style={{ marginLeft: 8 }} />
          )}
        </View>
        {c.visible && p ? (
          <>
            <Text style={[styles.msg, { color: colors.text }]}>
              {p.water_ml}/{p.water_goal} ml{status}
            </Text>
            <View style={[styles.bar, { backgroundColor: colors.border }]}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
            </View>
          </>
        ) : (
          <Text style={[styles.msg, { color: colors.textMuted }]}>
            Chưa xem được tiến độ của nhau (cần cả hai bật chia sẻ).
          </Text>
        )}
      </View>

      {!!c.question && (
        <View style={[styles.panel, { backgroundColor: colors.background }]}>
          <Text style={[styles.q, { color: colors.text }]}>Câu hỏi hôm nay: {c.question}</Text>
          {c.my_answer ? (
            <>
              <Text style={[styles.msg, { color: colors.text }]}>Bạn: {c.my_answer}</Text>
              <Text style={[styles.msg, { color: c.partner_answer ? colors.text : colors.textMuted }]}>
                {c.partner_answer ? `${c.partner_username}: ${c.partner_answer}` : `${c.partner_username} chưa trả lời.`}
              </Text>
            </>
          ) : (
            <View style={styles.formRow}>
              <Input
                colors={colors}
                value={answer}
                onChangeText={setAnswer}
                placeholder="Trả lời của bạn (người kia chỉ thấy sau khi cũng trả lời)"
                multiline
                style={{ flex: 1, maxHeight: 90, backgroundColor: colors.card }}
              />
              <Btn
                colors={colors}
                label="Gửi"
                onPress={async () => {
                  if (await sendAnswer(answer)) setAnswer("");
                }}
                busy={busy}
                disabled={!answer.trim()}
              />
            </View>
          )}
        </View>
      )}

      <SwitchRow
        colors={colors}
        label={`Cho ${c.partner_username} xem tiến độ của mình`}
        value={!!c.my_share}
        onValueChange={setShareProgress}
        disabled={busy}
      />
      <TouchableOpacity onPress={unlink} hitSlop={8} style={styles.unlink}>
        <Text style={[styles.link, { color: colors.textMuted }]}>Huỷ liên kết</Text>
      </TouchableOpacity>
      {errNode}
    </View>
  );
};

const styles = StyleSheet.create({
  msg: { fontSize: 13, lineHeight: 19 },
  caption: { fontSize: 12.5, fontWeight: "600", textAlign: "center", marginBottom: 6 },
  q: { fontSize: 13.5, fontWeight: "600", marginBottom: 6 },
  link: { fontSize: 12.5, fontWeight: "700" },
  formRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 10 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  fullBtn: { width: "100%", marginTop: 12 },
  panel: { borderRadius: 14, padding: 14, marginBottom: 4, marginTop: 8 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  panelTitle: { flex: 1, fontSize: 15, fontWeight: "700", marginRight: 8 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  barFill: { height: 6, borderRadius: 3 },
  unlink: { alignSelf: "flex-start", marginTop: 14 },
});