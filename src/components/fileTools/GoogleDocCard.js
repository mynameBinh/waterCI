// GoogleDocCard.js — thẻ "Google Docs: <tên file>" hiện dưới tin nhắn có link Google:
//   trạng thái quyền (Chỉnh sửa / Chỉ xem / Không có quyền) -> "Xem kế hoạch thay đổi" -> "Áp dụng" -> "Hoàn tác (mở bản sao lưu)".
// instruction = phần chữ của tin nhắn (bỏ link) — chính là điều người dùng muốn đổi; nếu trống thì hiện ô nhập.
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ApiError, googleApply, googleConnect, googleInspect, googlePlan, needsGoogleConnect, openUrl } from "./exportApi";

const KIND = { doc: "Google Docs", sheet: "Google Sheets", slides: "Google Slides", file: "Tệp Drive" };
const PERM = {
  edit: { label: "Chỉnh sửa", color: "#16A34A" },
  copy: { label: "Chỉ xem · tạo bản sao để sửa được", color: "#D97706" },
  comment: { label: "Chỉ góp ý (bình luận)", color: "#D97706" },
  view: { label: "Chỉ xem", color: "#6B7280" },
  none: { label: "Không có quyền", color: "#DC2626" },
};

const GoogleDocCard = memo(function GoogleDocCard({ url, instruction, colors, ctx, compact = false }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(""); // '' | 'plan' | 'apply'
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState(null);
  const [text, setText] = useState(instruction || "");

  useEffect(() => {
    let off = false;
    googleInspect(ctx, url)
      .then((r) => !off && setInfo(r))
      .catch((e) => !off && setErr(e));
    return () => { off = true; };
  }, [ctx, url]);

  const perm = err ? (err.status === 403 || err.status === 404 ? "none" : null) : info?.permission;
  const canEditFlow = info && info.kind && ["edit", "copy", "comment"].includes(info.permission);

  const makePlan = async () => {
    if (text.trim().length < 2) return Alert.alert("Bạn muốn đổi gì?", "Hãy nhập điều bạn muốn sửa trong file.");
    setBusy("plan"); setErr(null); setPlan(null); setDone(null);
    try {
      setPlan(await googlePlan(ctx, url, text.trim()));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy("");
    }
  };

  const apply = (useCopy) => {
    const msg = plan.comment_only
      ? "Mình sẽ thêm các bình luận này vào file (không sửa nội dung)."
      : useCopy
        ? "Mình sẽ tạo bản sao vào Drive của bạn rồi sửa bản sao. File gốc giữ nguyên."
        : "Mình sẽ tạo một bản sao lưu của file trước, rồi mới áp dụng thay đổi. Bạn có thể hoàn tác bằng bản sao lưu.";
    Alert.alert("Áp dụng thay đổi?", msg, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Áp dụng",
        onPress: async () => {
          setBusy("apply"); setErr(null);
          try {
            setDone(await googleApply(ctx, plan.plan_id, useCopy));
            setPlan(null);
          } catch (e) {
            setErr(e);
          } finally {
            setBusy("");
          }
        },
      },
    ]);
  };

  const connect = () => googleConnect(ctx).catch((e) => Alert.alert("Chưa kết nối được Google", e?.message || "Bạn thử lại nhé."));
  const p = PERM[perm || "view"];

  return (
    <View style={[s.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.head}>
        <Ionicons name="logo-google" size={18} color={colors.primary} />
        <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>
          {KIND[info?.kind || "file"]}: {info?.name || "đang đọc…"}
        </Text>
        {!info && !err && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {(info || perm === "none") && (
        <View style={s.badgeRow}>
          <View style={[s.dot, { backgroundColor: p.color }]} />
          <Text style={{ color: p.color, fontSize: 12.5, fontWeight: "700", flexShrink: 1 }}>{p.label}</Text>
        </View>
      )}

      {err && (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={{ color: "#DC2626", fontSize: 13 }}>{err.message}</Text>
          {needsGoogleConnect(err) && (
            <TouchableOpacity onPress={connect} style={[s.btn, { backgroundColor: colors.primary }]}>
              <Text style={[s.btnT, { color: colors.primaryText || "#fff" }]}>{err.code === "google_reauth" ? "Kết nối lại Google" : "Kết nối Google"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {info && !canEditFlow && !err && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
          {info.kind
            ? "Tài khoản của bạn chưa có quyền chỉnh sửa file này, hãy nhờ chủ file cấp quyền Người chỉnh sửa (Editor)."
            : "Đây không phải Google Docs / Sheets / Slides nên mình chỉ đọc được nội dung, chưa sửa trực tiếp được."}
        </Text>
      )}

      {canEditFlow && compact && !err && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
        </Text>
      )}

      {canEditFlow && !compact && !plan && !done && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {!instruction?.trim() && (
            <TextInput
              value={text} onChangeText={setText} multiline placeholder="Bạn muốn đổi gì? (vd: đổi font Times New Roman cỡ 13, giãn dòng 1,5)"
              placeholderTextColor={colors.textMuted}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          )}
          <TouchableOpacity onPress={makePlan} disabled={!!busy} activeOpacity={0.85} style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}>
            {busy === "plan" ? <ActivityIndicator size="small" color={colors.primaryText || "#fff"} /> : (
              <Text style={[s.btnT, { color: colors.primaryText || "#fff" }]}>Xem kế hoạch thay đổi</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {!compact && plan && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {!!plan.understood && <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600" }}>{plan.understood}</Text>}
          {plan.steps.map((st, i) => (
            <Text key={i} style={{ color: colors.text, fontSize: 13.5 }}>• {st}</Text>
          ))}
          {plan.unsupported?.length > 0 && (
            <View style={[s.warn, { backgroundColor: "#FEF3C7" }]}>
              <Text style={{ color: "#92400E", fontSize: 12.5, fontWeight: "700" }}>Phần mình không làm được:</Text>
              {plan.unsupported.map((u, i) => <Text key={i} style={{ color: "#78350F", fontSize: 12.5, marginTop: 2 }}>• {u}</Text>)}
            </View>
          )}
          {plan.needs_copy && (
            <Text style={{ color: "#B45309", fontSize: 12.5 }}>
              Bạn chỉ có quyền xem file này. Bạn có muốn tạo bản sao vào Drive của mình rồi sửa bản sao không? (File gốc giữ nguyên)
            </Text>
          )}
          {plan.can_apply ? (
            <View style={s.row}>
              <TouchableOpacity onPress={() => apply(plan.needs_copy)} disabled={!!busy} style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}>
                {busy === "apply" ? <ActivityIndicator size="small" color={colors.primaryText || "#fff"} /> : (
                  <Text style={[s.btnT, { color: colors.primaryText || "#fff" }]}>
                    {plan.comment_only ? "Thêm bình luận" : plan.needs_copy ? "Tạo bản sao và áp dụng" : "Áp dụng"}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPlan(null)} disabled={!!busy} style={[s.btn, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[s.btnT, { color: colors.text }]}>Bỏ qua</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Chưa có thay đổi nào để áp dụng. Bạn thử mô tả cụ thể hơn nhé.</Text>
          )}
        </View>
      )}

      {!compact && done && (
        <View style={{ marginTop: 10, gap: 6 }}>
          <View style={s.badgeRow}>
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
              {done.comment_only ? "Đã thêm bình luận" : done.copied ? "Đã sửa bản sao của bạn" : "Đã sửa xong"}
            </Text>
          </View>
          {done.summary.map((x, i) => <Text key={i} style={{ color: colors.text, fontSize: 13.5 }}>• {x}</Text>)}
          <View style={s.row}>
            <TouchableOpacity onPress={() => openUrl(done.url)} style={[s.btn, { backgroundColor: colors.primary }]}>
              <Text style={[s.btnT, { color: colors.primaryText || "#fff" }]}>Mở file</Text>
            </TouchableOpacity>
            {done.backup_url ? (
              <TouchableOpacity onPress={() => openUrl(done.backup_url)} style={[s.btn, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[s.btnT, { color: colors.text }]}>Hoàn tác (mở bản sao lưu)</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!!done.undo_hint && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{done.undo_hint}</Text>}
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 8, alignSelf: "stretch" },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 14.5, fontWeight: "700", flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  btn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center", flexShrink: 1 },
  btnT: { fontSize: 13.5, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, minHeight: 44, textAlignVertical: "top" },
  warn: { borderRadius: 10, padding: 10, marginTop: 4 },
});

export default GoogleDocCard;