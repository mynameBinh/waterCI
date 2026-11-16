// FileCardV2.js — thẻ file trong chat: icon theo loại, kích thước, Tải / Chia sẻ / Mở bằng ứng dụng khác,
// trạng thái đang tạo / lỗi / thử lại, xem trước + chọn theme, Lưu vào Google Drive, cảnh báo từ server.
// Dùng cho định dạng docx / xlsx / pdf / pptx / gdoc / gsheet / gslides (csv, md, txt vẫn dùng FileCard cũ).
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ExportPreviewSheet from "./ExportPreviewSheet";
import {
  ApiError, exportFile, formatBytes, googleConnect, googleStatus, needsGoogleConnect, openUrl, saveBase64, shareSaved,
} from "./exportApi";
import { estimate, FORMATS, GOOGLE_LABEL, loadDefaultTheme, saveDefaultTheme } from "./exportMeta";

const FileCardV2 = memo(function FileCardV2({ file, colors, ctx }) {
  const [theme, setTheme] = useState("mint");
  const [preview, setPreview] = useState(false);
  const [state, setState] = useState("idle"); // idle | creating | done | error
  const [res, setRes] = useState(null); // { fmt, filename, mime, uri?, size?, url?, warnings }
  const [err, setErr] = useState(null); // ApiError
  const [google, setGoogle] = useState(null); // true | false | null
  const [lastReq, setLastReq] = useState(null);
  const [showWarn, setShowWarn] = useState(false);

  useEffect(() => {
    loadDefaultTheme().then(setTheme);
  }, []);

  const lock = file.from ? (/\.xlsx?m?$/i.test(file.from) ? "xlsx" : /\.docx$/i.test(file.from) ? "docx" : null) : null;
  const t = FORMATS[res?.fmt || (lock || file.fmt)] || FORMATS.docx;

  const openPreview = useCallback(() => {
    setPreview(true);
    if (google === null) googleStatus(ctx).then((g) => setGoogle(!!g.connected)).catch(() => setGoogle(false));
  }, [ctx, google]);

  const run = useCallback(
    async (req) => {
      setLastReq(req);
      setState("creating");
      setErr(null);
      try {
        let source;
        if (file.from) {
          const att = ctx.findAttachment?.(file.from);
          if (!att?.data) throw new ApiError(`Không tìm thấy file gốc «${file.from}» trong cuộc trò chuyện để sửa. Hãy đính kèm lại file rồi nhờ AI sửa.`, 0, "no_source");
          source = { name: att.name, mime: att.mime || "", data: att.data };
        }
        const r = await exportFile(ctx, { format: req.format, title: req.title, content: file.body, theme, source });
        if (FORMATS[req.format].google) {
          setRes({ fmt: req.format, filename: r.filename, url: r.url, warnings: r.warnings || [] });
        } else {
          const saved = saveBase64(r.filename, r.data);
          setRes({ fmt: req.format, filename: r.filename, mime: r.mime, uri: saved.uri, size: saved.size, warnings: r.warnings || [] });
        }
        setState("done");
        setPreview(false);
      } catch (e) {
        setErr(e instanceof ApiError ? e : new ApiError(e?.message || "Không tạo được file, bạn thử lại nhé."));
        setState("error");
        setPreview(false);
      }
    },
    [ctx, file, theme],
  );

  const onTheme = (k) => {
    setTheme(k);
    saveDefaultTheme(k);
  };

  const share = async () => {
    try {
      await shareSaved({ uri: res.uri, mime: res.mime, filename: res.filename });
    } catch (e) {
      Alert.alert("Không chia sẻ được", e?.message || "Bạn thử lại nhé.");
    }
  };
  const openWith = async () => {
    if (Platform.OS === "android") {
      try {
        const IL = require("expo-intent-launcher"); // tuỳ chọn: chưa cài thì dùng bảng chia sẻ
        const { File } = require("expo-file-system");
        await IL.startActivityAsync("android.intent.action.VIEW", { data: new File(res.uri).contentUri, flags: 1, type: res.mime });
        return;
      } catch {}
    }
    share(); // iOS: bảng chia sẻ có mục "Mở bằng…"
  };
  const connect = async () => {
    try {
      await googleConnect(ctx);
    } catch (e) {
      Alert.alert("Chưa kết nối được Google", e?.message || "Bạn thử lại nhé.");
    }
  };

  const busy = state === "creating";
  const sub =
    state === "done"
      ? res.url
        ? `${GOOGLE_LABEL[res.fmt]} · đã lưu vào Drive`
        : `${t.label} · ${formatBytes(res.size)}`
      : `${t.label} · ${estimate(file.body, lock || file.fmt)}`;
  const displayName = state === "done" ? res.filename : `${file.name}${t.ext ? "." + t.ext : ""}`;

  return (
    <View style={[s.box, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={s.top}>
        <View style={[s.tile, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={state === "error" ? "alert-circle-outline" : t.icon} size={22} color={state === "error" ? "#DC2626" : colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{displayName}</Text>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {busy ? "Đang tạo file…" : sub}
          </Text>
        </View>
        {state === "idle" && (
          <TouchableOpacity onPress={openPreview} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Xem trước và tải file"
            style={[s.btn, { backgroundColor: colors.primary }]}>
            <Ionicons name="download-outline" size={16} color={colors.primaryText || "#fff"} />
            <Text style={[s.btnText, { color: colors.primaryText || "#fff" }]}>Tải</Text>
          </TouchableOpacity>
        )}
        {busy && <View style={[s.btn, { backgroundColor: colors.primary, opacity: 0.7 }]}><Text style={[s.btnText, { color: colors.primaryText || "#fff" }]}>Đang tạo…</Text></View>}
      </View>

      {state === "error" && (
        <View style={s.msgBox}>
          <Text style={{ color: "#DC2626", fontSize: 13 }}>{err?.message}</Text>
          <View style={s.row}>
            {needsGoogleConnect(err) || err?.code === "google_not_connected" ? (
              <TouchableOpacity onPress={connect} style={[s.sm, { backgroundColor: colors.primary }]}>
                <Ionicons name="logo-google" size={14} color={colors.primaryText || "#fff"} />
                <Text style={[s.smText, { color: colors.primaryText || "#fff" }]}>{err?.code === "google_reauth" ? "Kết nối lại Google" : "Kết nối Google"}</Text>
              </TouchableOpacity>
            ) : null}
            {err?.code !== "no_source" && lastReq ? (
              <TouchableOpacity onPress={() => run(lastReq)} style={[s.sm, { borderColor: colors.border, borderWidth: 1 }]}>
                <Ionicons name="refresh-outline" size={14} color={colors.text} />
                <Text style={[s.smText, { color: colors.text }]}>Thử lại</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={openPreview} style={[s.sm, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[s.smText, { color: colors.text }]}>Đổi cách xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {state === "done" && (
        <View style={s.msgBox}>
          <View style={s.row}>
            {res.url ? (
              <TouchableOpacity onPress={() => openUrl(res.url)} style={[s.sm, { backgroundColor: colors.primary }]}>
                <Ionicons name="open-outline" size={14} color={colors.primaryText || "#fff"} />
                <Text style={[s.smText, { color: colors.primaryText || "#fff" }]}>Mở trong {GOOGLE_LABEL[res.fmt]}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity onPress={share} style={[s.sm, { backgroundColor: colors.primary }]}>
                  <Ionicons name="share-outline" size={14} color={colors.primaryText || "#fff"} />
                  <Text style={[s.smText, { color: colors.primaryText || "#fff" }]}>Chia sẻ / Lưu</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openWith} style={[s.sm, { borderColor: colors.border, borderWidth: 1 }]}>
                  <Ionicons name="open-outline" size={14} color={colors.text} />
                  <Text style={[s.smText, { color: colors.text }]}>Mở bằng ứng dụng khác</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => { setState("idle"); openPreview(); }} style={[s.sm, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[s.smText, { color: colors.text }]}>Tạo lại</Text>
            </TouchableOpacity>
          </View>
          {res.warnings?.length > 0 && (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowWarn((v) => !v)} style={[s.warn, { backgroundColor: "#FEF3C7" }]}>
              <View style={s.row}>
                <Ionicons name="warning-outline" size={16} color="#B45309" />
                <Text style={{ color: "#92400E", fontSize: 12.5, fontWeight: "600", flex: 1 }}>
                  Lưu ý khi dùng file ({res.warnings.length}) · {showWarn ? "Thu gọn" : "Xem"}
                </Text>
              </View>
              {showWarn && res.warnings.map((w, i) => (
                <Text key={i} style={{ color: "#78350F", fontSize: 12.5, marginTop: 4 }}>• {w}</Text>
              ))}
            </TouchableOpacity>
          )}
        </View>
      )}

      <ExportPreviewSheet
        visible={preview}
        onClose={() => setPreview(false)}
        onConfirm={run}
        colors={colors}
        file={file}
        theme={theme}
        onThemeChange={onTheme}
        googleConnected={google}
        lockFormat={lock}
        busy={busy}
      />
    </View>
  );
});

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  tile: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14.5, fontWeight: "600" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { fontSize: 14, fontWeight: "700" },
  msgBox: { marginTop: 10, gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  sm: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, maxWidth: "100%" },
  smText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  warn: { borderRadius: 10, padding: 10 },
});

export default FileCardV2;
