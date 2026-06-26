import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

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
}) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={profileContent} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.profileHeader}>
        <Ionicons name="notifications" size={50} color="#0ea5e9" style={{ marginBottom: 10 }} />
        <Text style={[styles.profileName, { color: colors.text }]}>Cài đặt thông báo</Text>
        <Text style={[styles.profileRole, { color: colors.textMuted }]}>Nhắc nhở uống nước mỗi ngày</Text>
      </View>

      {/* Toggle Push */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>Cho phép thông báo</Text>
          <Text style={styles.sectionSubtitle}>Nhận tin nhắn nhắc nhở</Text>
        </View>
        <Switch
          trackColor={{ false: '#cbd5e1', true: '#10b981' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#cbd5e1"
          onValueChange={onTogglePush}
          value={isPushEnabled}
          style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
        />
      </View>

      {/* Sound selector */}
      <View
        style={[styles.settingsCard, { backgroundColor: colors.card, opacity: isPushEnabled ? 1 : 0.5 }]}
        pointerEvents={isPushEnabled ? 'auto' : 'none'}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Âm thanh thông báo</Text>
        <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowSoundModal(true)}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{selectedSound}</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Time chips */}
      <View
        style={[styles.settingsCard, { backgroundColor: colors.card, opacity: isPushEnabled ? 1 : 0.5 }]}
        pointerEvents={isPushEnabled ? 'auto' : 'none'}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Các mốc giờ nhắc nhở</Text>
          <TouchableOpacity style={styles.addTimeBtn} onPress={() => setShowCustomTimeModal(true)}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.chipsContainer}>
          {presetTimes
            .concat(selectedTimes.filter(t => !presetTimes.includes(t)))
            .sort()
            .map(time => {
              const isSelected = selectedTimes.includes(time);
              return (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.timeChip,
                    isSelected
                      ? styles.timeChipActive
                      : { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                  onPress={() => onToggleTime(time)}
                >
                  <Text style={[styles.timeChipText, { color: isSelected ? '#0ea5e9' : colors.textMuted }]}>
                    {time}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>
      </View>

      {/* ─── Modal: Chọn âm thanh ─── */}
      <Modal visible={showSoundModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 16 }]}>Chọn âm thanh 🎵</Text>
            <View style={{ width: '100%', marginBottom: 20 }}>
              {soundOptions.map(sound => (
                <TouchableOpacity
                  key={sound}
                  style={[styles.dropdownOption, selectedSound === sound && { backgroundColor: '#f0f9ff' }]}
                  onPress={() => { setSelectedSound(sound); setShowSoundModal(false); }}
                >
                  <Text style={{ fontSize: 16, color: selectedSound === sound ? '#0ea5e9' : colors.text, fontWeight: selectedSound === sound ? '700' : '500' }}>
                    {sound}
                  </Text>
                  {selectedSound === sound && <Ionicons name="checkmark-circle" size={24} color="#0ea5e9" />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#64748b' }]} onPress={() => setShowSoundModal(false)}>
              <Text style={styles.confirmBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Thêm giờ tùy chỉnh ─── */}
      <Modal visible={showCustomTimeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 10 }]}>Thêm mốc thời gian ⏰</Text>
            <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginBottom: 16 }]}>
              Nhập giờ nhắc nhở theo định dạng HH:MM
            </Text>
            <TextInput
              style={[styles.customTimeInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="VD: 09:30"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={5}
              value={customTimeInput}
              onChangeText={text => {
                let f = text.replace(/[^0-9]/g, '');
                if (f.length >= 3) f = f.slice(0, 2) + ':' + f.slice(2);
                setCustomTimeInput(f);
              }}
            />
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: '#64748b' }]}
                onPress={() => { setShowCustomTimeModal(false); setCustomTimeInput(''); }}
              >
                <Text style={styles.confirmBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: '#10b981' }]}
                onPress={onAddCustomTime}
              >
                <Text style={styles.confirmBtnText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
});

export default NotificationsTab;

const styles = StyleSheet.create({
  profileHeader:    { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  profileName:      { fontSize: 24, fontWeight: '800' },
  profileRole:      { fontSize: 14, marginTop: 4, fontWeight: '500' },
  settingsCard:     { borderRadius: 20, padding: 20, marginBottom: 24, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  sectionTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionSubtitle:  { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 16 },
  dropdownSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(148,163,184,0.1)' },
  dropdownOption:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8 },
  chipsContainer:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  timeChip:         { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  timeChipActive:   { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  timeChipText:     { fontWeight: '700', fontSize: 14 },
  addTimeBtn:       { backgroundColor: '#0ea5e9', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  customTimeInput:  { borderWidth: 2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, textAlign: 'center', fontWeight: '700', marginBottom: 24, width: '100%' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalCard:        { width: '90%', maxWidth: 350, borderRadius: 32, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  modalTitle:       { fontSize: 18, fontWeight: '800' },
  confirmBtn:       { width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  confirmBtnText:   { color: '#ffffff', fontSize: 16, fontWeight: '750' },
});
