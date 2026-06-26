import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ProfileTab = memo(function ProfileTab({
  username,
  memberTier,
  goalMl,
  onLogout,
  profileContent,
}) {
  const { themePreference, changeTheme, colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={profileContent} showsVerticalScrollIndicator={false}>
      {/* Avatar */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatarWrapper, { borderColor: colors.card, backgroundColor: colors.background }]}>
          <Ionicons name="person" size={50} color="#0ea5e9" />
        </View>
        <Text style={[styles.profileName, { color: colors.text }]}>{username}</Text>
        <Text style={[styles.profileRole, { color: colors.textMuted }]}>{memberTier}</Text>
      </View>

      {/* Mục tiêu */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Mục tiêu sức khỏe</Text>
        <Text style={styles.sectionSubtitle}>
          Dung tích nước cần uống mỗi ngày (Chỉ Admin mới có quyền điều chỉnh).
        </Text>
        <View style={styles.goalRow}>
          <View style={styles.rowLeft}>
            <Ionicons name="water-outline" size={20} color="#10b981" style={{ marginRight: 10 }} />
            <Text style={[styles.rowText, { color: colors.text }]}>Mục tiêu uống nước</Text>
          </View>
          <Text style={styles.goalValue}>{goalMl} ml / ngày</Text>
        </View>
      </View>

      {/* Theme */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Giao diện ứng dụng</Text>
        <View style={styles.themeRow}>
          {[
            { key: 'light',  icon: 'sunny',            label: 'Sáng' },
            { key: 'dark',   icon: 'moon',             label: 'Tối' },
            { key: 'system', icon: 'settings-outline', label: 'Hệ thống' },
          ].map(({ key, icon, label }) => {
            const active = themePreference === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeBtn,
                  active
                    ? styles.themeBtnActive
                    : { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                onPress={() => changeTheme(key)}
              >
                <Ionicons name={icon} size={24} color={active ? '#0ea5e9' : colors.textMuted} />
                <Text style={[styles.themeText, { color: active ? '#0ea5e9' : colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        <Text style={styles.logoutBtnText}>Đăng xuất tài khoản</Text>
      </TouchableOpacity>
    </ScrollView>
  );
});

export default ProfileTab;

const styles = StyleSheet.create({
  profileHeader: { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  profileName:   { fontSize: 24, fontWeight: '800' },
  profileRole:   { fontSize: 14, marginTop: 4, fontWeight: '500' },
  settingsCard:  { borderRadius: 20, padding: 20, marginBottom: 24, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 16 },
  goalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 },
  rowLeft:       { flexDirection: 'row', alignItems: 'center' },
  rowText:       { fontSize: 14, fontWeight: '600' },
  goalValue:     { color: '#10b981', fontSize: 15, fontWeight: '800' },
  themeRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  themeBtn:      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4, borderWidth: 1 },
  themeBtnActive: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  themeText:     { marginTop: 8, fontSize: 13, fontWeight: '600' },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#fecaca' },
  logoutBtnText: { marginLeft: 8, fontSize: 16, fontWeight: '700', color: '#ef4444' },
});
