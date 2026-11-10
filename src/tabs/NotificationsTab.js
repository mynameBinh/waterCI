import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback, useMemo } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const IS_IOS = Platform.OS === 'ios';

// HH:MM hợp lệ: 00–23 giờ, 00–59 phút
const isValidTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

const NotificationsTab = memo(function NotificationsTab({
  isPushEnabled,
  onTogglePush,
  selectedSound,
  showSoundModal,
  setShowSoundModal,
  soundOptions,
  setSelectedSound,
  selectedTimes,
  presetTimes,
  onToggleTime,
  showCustomTimeModal,
  setShowCustomTimeModal,
  customTimeInput,
  setCustomTimeInput,
  onAddCustomTime,
  profileContent,
  // ── Tuỳ chọn (không truyền vẫn chạy bình thường) ──
  permissionStatus, // 'granted' | 'denied' | 'undetermined' — quyền thông báo của hệ điều hành
  onTestNotification, // () => void — gửi thử 1 thông báo để nghe âm thanh
}) {
  const { colors } = useTheme();

  // Danh sách giờ: preset + giờ tự thêm, đã sắp xếp (không tính lại mỗi lần render)
  const allTimes = useMemo(
    () =>
      presetTimes
        .concat(selectedTimes.filter((t) => !presetTimes.includes(t)))
        .sort(),
    [presetTimes, selectedTimes],
  );

  const timeValid = isValidTime(customTimeInput);
  const permissionDenied = permissionStatus === 'denied';

  const openSettings = useCallback(() => {
    // iOS: mở thẳng trang Cài đặt của ứng dụng; Android: mở cài đặt ứng dụng
    Linking.openSettings().catch(() => {});
  }, []);

  const closeSound = useCallback(() => setShowSoundModal(false), [setShowSoundModal]);
  const closeCustomTime = useCallback(() => {
    Keyboard.dismiss();
    setShowCustomTimeModal(false);
    setCustomTimeInput('');
  }, [setShowCustomTimeModal, setCustomTimeInput]);

  const handleTimeChange = useCallback(
    (text) => {
      let f = text.replace(/[^0-9]/g, '').slice(0, 4);
      if (f.length >= 3) f = f.slice(0, 2) + ':' + f.slice(2);
      setCustomTimeInput(f);
    },
    [setCustomTimeInput],
  );

  const handleSubmitTime = useCallback(() => {
    if (timeValid) onAddCustomTime();
  }, [timeValid, onAddCustomTime]);

  const cardShadow = { shadowColor: colors.dockShadow };

  return (
    <ScrollView
      contentContainerStyle={profileContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.profileHeader}>
        <Ionicons name="notifications" size={50} color={colors.primary} style={{ marginBottom: 10 }} />
        <Text style={[styles.profileName, { color: colors.text }]}>Cài đặt thông báo</Text>
        <Text style={[styles.profileRole, { color: colors.textMuted }]}>Nhắc nhở uống nước mỗi ngày</Text>
      </View>

      {/* Quyền thông báo bị tắt ở cấp hệ điều hành (iOS chỉ hỏi 1 lần, sau đó phải vào Cài đặt) */}
      {permissionDenied && (
        <View style={[styles.banner, { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.45)' }]}>
          <Ionicons name="warning" size={20} color="#f59e0b" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>Thông báo đang bị chặn</Text>
            <Text style={[styles.bannerText, { color: colors.textMuted }]}>
              {IS_IOS
                ? 'Vào Cài đặt > Thông báo của ứng dụng và bật "Cho phép thông báo" để nhận nhắc nhở.'
                : 'Hãy bật quyền thông báo trong cài đặt ứng dụng để nhận nhắc nhở.'}
            </Text>
            <TouchableOpacity onPress={openSettings} style={styles.bannerBtn} activeOpacity={0.8}>
              <Text style={styles.bannerBtnText}>Mở Cài đặt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Toggle Push */}
      <View style={[styles.settingsCard, cardShadow, styles.row, { backgroundColor: colors.card }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>Cho phép thông báo</Text>
          <Text style={[styles.sectionSubtitle, { marginBottom: 0 }]}>Nhận tin nhắn nhắc nhở</Text>
        </View>
        <Switch
          trackColor={{ false: '#cbd5e1', true: '#10b981' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#cbd5e1"
          onValueChange={onTogglePush}
          value={isPushEnabled}
          accessibilityLabel="Cho phép thông báo"
          // iOS: giữ nguyên kích thước gốc (phóng to bằng transform làm lệch vùng chạm + bị mờ)
          style={IS_IOS ? undefined : { transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
        />
      </View>

      {/* Sound selector */}
      <View
        style={[styles.settingsCard, cardShadow, { backgroundColor: colors.card, opacity: isPushEnabled ? 1 : 0.5 }]}
        pointerEvents={isPushEnabled ? 'auto' : 'none'}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Âm thanh thông báo</Text>
        <TouchableOpacity
          style={styles.dropdownSelector}
          onPress={() => setShowSoundModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Âm thanh thông báo: ${selectedSound}`}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{selectedSound}</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {!!onTestNotification && (
          <TouchableOpacity
            style={[styles.testBtn, { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft }]}
            onPress={onTestNotification}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Ionicons name="paper-plane-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.testBtnText, { color: colors.primaryText }]}>Gửi thử thông báo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Time chips */}
      <View
        style={[styles.settingsCard, cardShadow, { backgroundColor: colors.card, opacity: isPushEnabled ? 1 : 0.5 }]}
        pointerEvents={isPushEnabled ? 'auto' : 'none'}
      >
        <View style={[styles.row, { marginBottom: 12 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Các mốc giờ nhắc nhở</Text>
          <TouchableOpacity
            style={[styles.addTimeBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCustomTimeModal(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Thêm mốc giờ"
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.chipsContainer}>
          {allTimes.map((time) => {
            const isSelected = selectedTimes.includes(time);
            return (
              <TouchableOpacity
                key={time}
                style={[
                  styles.timeChip,
                  isSelected
                    ? { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }
                    : { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                onPress={() => onToggleTime(time)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Nhắc lúc ${time}`}
              >
                <Text style={[styles.timeChipText, { color: isSelected ? colors.primaryText : colors.textMuted }]}>
                  {time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Modal: Chọn âm thanh ─── */}
      <Modal visible={showSoundModal} transparent animationType="fade" onRequestClose={closeSound}>
        <View style={styles.modalOverlay}>
          {/* bấm ra ngoài để đóng */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSound} />
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 16 }]}>Chọn âm thanh 🎵</Text>
            <ScrollView style={styles.soundList} showsVerticalScrollIndicator={false} bounces={false}>
              {soundOptions.map((sound) => {
                const selected = selectedSound === sound;
                return (
                  <TouchableOpacity
                    key={sound}
                    style={[styles.dropdownOption, selected && { backgroundColor: colors.primarySoft }]}
                    onPress={() => {
                      setSelectedSound(sound);
                      setShowSoundModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        color: selected ? colors.primaryText : colors.text,
                        fontWeight: selected ? '700' : '500',
                      }}
                    >
                      {sound}
                    </Text>
                    {selected && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: '#64748b', marginTop: 12 }]}
              onPress={closeSound}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Thêm giờ tùy chỉnh ─── */}
      <Modal visible={showCustomTimeModal} transparent animationType="fade" onRequestClose={closeCustomTime}>
        {/* KeyboardAvoidingView: bàn phím iOS không che ô nhập / nút Lưu */}
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={IS_IOS ? 'padding' : undefined}>
          {/* bấm ra ngoài: ẩn bàn phím */}
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 10 }]}>Thêm mốc thời gian ⏰</Text>
            <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginBottom: 16 }]}>
              Nhập giờ nhắc nhở theo định dạng HH:MM (24 giờ)
            </Text>
            <TextInput
              style={[
                styles.customTimeInput,
                {
                  color: colors.text,
                  borderColor: customTimeInput.length === 5 && !timeValid ? '#ef4444' : colors.border,
                },
              ]}
              placeholder="VD: 09:30"
              placeholderTextColor={colors.textMuted}
              // iOS: bàn phím "numeric" có dấu thập phân thừa; "number-pad" chỉ có 0–9
              keyboardType={IS_IOS ? 'number-pad' : 'numeric'}
              maxLength={5}
              autoFocus
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmitTime}
              value={customTimeInput}
              onChangeText={handleTimeChange}
              accessibilityLabel="Giờ nhắc nhở"
            />
            {customTimeInput.length === 5 && !timeValid && (
              <Text style={styles.errorText}>Giờ không hợp lệ (00:00 – 23:59)</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: '#64748b' }]}
                onPress={closeCustomTime}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: '#10b981', opacity: timeValid ? 1 : 0.45 }]}
                onPress={handleSubmitTime}
                disabled={!timeValid}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
});

export default NotificationsTab;

const styles = StyleSheet.create({
  profileHeader:    { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  profileName:      { fontSize: Platform.OS === 'android' ? 22 : 24, fontWeight: '800' },
  profileRole:      { fontSize: 14, marginTop: 4, fontWeight: '500' },
  row:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsCard:     { borderRadius: 20, padding: 20, marginBottom: 24, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  sectionTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionSubtitle:  { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 16 },
  dropdownSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(148,163,184,0.1)' },
  dropdownOption:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8 },
  soundList:        { width: '100%', maxHeight: 320 },
  chipsContainer:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  timeChip:         { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  timeChipText:     { fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] },
  addTimeBtn:       { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  customTimeInput:  { borderWidth: 2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, textAlign: 'center', fontWeight: '700', marginBottom: 24, width: '100%', fontVariant: ['tabular-nums'] },
  errorText:        { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: -16, marginBottom: 16 },
  testBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  testBtnText:      { fontSize: 14, fontWeight: '700' },
  banner:           { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 20 },
  bannerTitle:      { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  bannerText:       { fontSize: 12.5, lineHeight: 18 },
  bannerBtn:        { alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  bannerBtnText:    { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalCard:        { width: '90%', maxWidth: 350, borderRadius: 32, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  modalTitle:       { fontSize: 18, fontWeight: '800' },
  confirmBtn:       { width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  // '750' không phải mức đậm hợp lệ trên iOS (chỉ 100–900 theo bước 100)
  confirmBtnText:   { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});