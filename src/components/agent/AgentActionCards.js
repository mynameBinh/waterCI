// =============================================================================
// AgentActionCards — thẻ dưới tin nhắn của AI khi AI đã LÀM việc gì đó:
//   • confirm: việc nhạy cảm (xoá mục tiêu, nhắn cho người kia, đổi mục tiêu nước...) -> [Đồng ý] / [Huỷ].
//              Việc CHỈ xảy ra khi bạn bấm Đồng ý (server chặn, AI không tự chạy được).
//   • action : việc nhẹ AI đã làm (đặt nhắc, lưu ngày đặc biệt...) -> dòng xác nhận + nút Hoàn tác.
// Trạng thái từng thẻ lưu ở cấp module để không mất khi danh sách tin nhắn dựng lại.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const CARD_STATE = new Map(); // id -> { status: "confirmed"|"rejected"|"undone"|"failed", message, undoable }
const DANGER = "#d64545";

const Card = memo(function Card({ a, colors, api }) {
  const [st, setSt] = useState(() => CARD_STATE.get(a.id) || null);
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    (next) => {
      CARD_STATE.set(a.id, next);
      setSt(next);
    },
    [a.id],
  );

  const run = useCallback(
    async (verb) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await api(`/api/agent/actions/${a.id}/${verb}`, { method: "POST" });
        if (verb === "confirm") save({ status: "confirmed", message: r?.message || "Xong rồi.", undoable: !!r?.undoable });
        else if (verb === "reject") save({ status: "rejected", message: "Đã huỷ." });
        else save({ status: "undone", message: r?.message || "Đã hoàn tác." });
      } catch (e) {
        save({ ...(st || {}), status: "failed", message: e?.message || "Có lỗi xảy ra, bạn thử lại nhé." });
      } finally {
        setBusy(false);
      }
    },
    [a.id, api, busy, save, st],
  );

  const box = [styles.box, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder || colors.border }];
  const text = { color: colors.primaryText || colors.text };
  const muted = { color: colors.textMuted };

  // ── việc nhẹ AI đã làm ──
  if (a.t === "action") {
    const undone = st?.status === "undone";
    return (
      <View style={box}>
        <View style={styles.row}>
          <Ionicons name={undone ? "arrow-undo" : "checkmark-circle"} size={16} color={colors.primary} />
          <Text style={[styles.title, text, { flex: 1 }]} numberOfLines={2}>
            {undone ? "Đã hoàn tác: " : ""}
            {a.title}
          </Text>
          {a.undoable && !undone && (
            <TouchableOpacity onPress={() => run("undo")} disabled={busy} hitSlop={8}>
              {busy ? <ActivityIndicator size="small" /> : <Text style={[styles.link, { color: colors.primary }]}>Hoàn tác</Text>}
            </TouchableOpacity>
          )}
        </View>
        {st?.status === "failed" && <Text style={[styles.msg, { color: DANGER }]}>{st.message}</Text>}
      </View>
    );
  }

  // ── việc cần xác nhận ──
  const accent = a.danger ? DANGER : colors.primary;
  if (st?.status === "confirmed") {
    return (
      <View style={box}>
        <View style={styles.row}>
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          <Text style={[styles.title, text, { flex: 1 }]} numberOfLines={2}>
            {st.message}
          </Text>
          {st.undoable && (
            <TouchableOpacity onPress={() => run("undo")} disabled={busy} hitSlop={8}>
              <Text style={[styles.link, { color: colors.primary }]}>Hoàn tác</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
  if (st?.status === "rejected" || st?.status === "undone") {
    return (
      <View style={box}>
        <Text style={[styles.msg, muted]}>{st.message}</Text>
      </View>
    );
  }
  return (
    <View style={[box, a.danger && { borderColor: DANGER }]}>
      <View style={styles.row}>
        <Ionicons name={a.danger ? "warning" : "help-circle"} size={17} color={accent} />
        <Text style={[styles.title, text, { flex: 1 }]}>{a.title}</Text>
      </View>
      {!!a.detail && <Text style={[styles.detail, muted]}>{a.detail}</Text>}
      {st?.status === "failed" && <Text style={[styles.msg, { color: DANGER }]}>{st.message}</Text>}
      {st?.status !== "failed" && (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: accent }]}
            onPress={() => run("confirm")}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Đồng ý</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }]}
            onPress={() => run("reject")}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>Huỷ</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const AgentActionCards = memo(function AgentActionCards({ actions, colors, api }) {
  if (!actions || !actions.length) return null;
  return (
    <View style={styles.wrap}>
      {actions.map((a) => (
        <Card key={a.id} a={a} colors={colors} api={api} />
      ))}
    </View>
  );
});

export default AgentActionCards;

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  box: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 9, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 13.5, fontWeight: "600" },
  detail: { fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  msg: { fontSize: 12.5, marginTop: 4 },
  link: { fontSize: 12.5, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
});
