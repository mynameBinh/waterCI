// =============================================================================
// Avatar — ảnh đại diện người dùng, DÙNG CHUNG cho mọi nơi cần hiện người dùng (Tôi, Cặp đôi, header, chat...).
//   <Avatar name={username} uri={useAvatarUri(username)} size={40} />
//   useAvatarUri(username)  -> uri ảnh đã chọn trên máy (null nếu chưa chọn); tự cập nhật ở MỌI nơi khi đổi ảnh.
//   pickAvatar(username)    -> mở thư viện ảnh, cắt vuông, lưu vào thư mục tài liệu của app, trả về uri mới.
//   removeAvatar(username)  -> xoá ảnh cục bộ.
//   uploadAvatar / deleteRemoteAvatar / avatarSource -> đồng bộ lên server để người kia (Cặp đôi) thấy được.
// Chỉ lưu TÊN FILE trong AsyncStorage (đường dẫn tuyệt đối của iOS đổi sau mỗi lần cập nhật app).
// =============================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const KEY = (u) => `avatar_file:${u}`;
const safe = (u) => String(u).replace(/[^a-z0-9_-]/gi, "_");

// ── kho nhỏ dùng chung: username -> tên file ──
let files = {};
const listeners = new Set();
const loaded = new Set();
const emit = () => {
  files = { ...files };
  listeners.forEach((l) => l());
};
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => files;

const uriOf = (name) => {
  if (!name) return null;
  try {
    const f = new File(Paths.document, name);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
};

async function ensureLoaded(username) {
  if (!username || loaded.has(username)) return;
  loaded.add(username);
  try {
    const name = await AsyncStorage.getItem(KEY(username));
    if (name && uriOf(name)) {
      files[username] = name;
      emit();
    }
  } catch {
    /* không đọc được thì coi như chưa có ảnh */
  }
}

export function useAvatarUri(username) {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    ensureLoaded(username);
  }, [username]);
  const name = username ? all[username] : null;
  return useMemo(() => uriOf(name), [name]);
}

function dropFile(name) {
  try {
    const f = new File(Paths.document, name);
    if (f.exists) f.delete();
  } catch {
    /* bỏ qua */
  }
}

// Mở thư viện ảnh -> cắt vuông -> lưu. Trả về uri mới, hoặc null nếu người dùng huỷ.
export async function pickAvatar(username) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    exif: false,
  });
  const src = !res.canceled && res.assets?.[0]?.uri;
  if (!src) return null;
  const name = `avatar_${safe(username)}_${Date.now()}.jpg`;
  const dest = new File(Paths.document, name);
  new File(src).copy(dest);
  const old = files[username];
  await AsyncStorage.setItem(KEY(username), name);
  files[username] = name;
  emit();
  if (old && old !== name) dropFile(old);
  return dest.uri;
}

export async function removeAvatar(username) {
  const old = files[username];
  try {
    await AsyncStorage.removeItem(KEY(username));
  } catch {
    /* bỏ qua */
  }
  delete files[username];
  emit();
  if (old) dropFile(old);
}

// ── đồng bộ lên server (để người kia trong Cặp đôi thấy) ──
export async function uploadAvatar({ uri, token, apiBase, authFetch }) {
  const form = new FormData();
  form.append("image", new File(uri)); // SDK 54+: phải là Blob/File thật (giống buildImageFormData ở Dashboard)
  const res = await (authFetch || fetch)(`${apiBase}/api/me/avatar`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error("upload avatar failed");
}

export async function deleteRemoteAvatar({ token, apiBase, authFetch }) {
  await (authFetch || fetch)(`${apiBase}/api/me/avatar`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Nguồn ảnh từ server cho <Image>/<Avatar>. `version` đổi thì tải lại, không đổi thì dùng cache.
export const avatarSource = ({ apiBase, token, username, version }) =>
  username && version && token
    ? {
        uri: `${apiBase}/api/avatar/${encodeURIComponent(username)}?v=${version}`,
        headers: { Authorization: `Bearer ${token}` },
        cache: "force-cache",
      }
    : null;

// ── thành phần hiển thị ──
// Ưu tiên `source` (server) / `uri` (máy). Không có ảnh hoặc tải lỗi -> chữ cái đầu trên nền màu chủ đạo.
export const Avatar = memo(function Avatar({ uri, source, name = "", size = 48, ringColor, style }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const src = source || (uri ? { uri } : null);
  const key = src?.uri;
  useEffect(() => setFailed(false), [key]);

  const base = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: ringColor ? Math.max(2, size / 28) : 0,
    borderColor: ringColor,
  };
  if (src && !failed) {
    return (
      <Image
        source={src}
        onError={() => setFailed(true)}
        fadeDuration={0}
        resizeMode="cover"
        style={[base, { backgroundColor: colors.primarySoft }, style]}
        accessibilityLabel={name ? `Ảnh đại diện của ${name}` : "Ảnh đại diện"}
      />
    );
  }
  const letter = (String(name).trim()[0] || "?").toUpperCase();
  return (
    <View style={[base, styles.fallback, { backgroundColor: colors.primarySoft }, style]}>
      <Text style={[styles.letter, { color: colors.primaryText, fontSize: size * 0.42 }]}>{letter}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  letter: { fontWeight: "800" },
});
