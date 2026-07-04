import { Ionicons } from '@expo/vector-icons';
import React, { memo, useMemo } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const RoadmapTab = memo(function RoadmapTab({
  streak,
  gifts,
  selectedGiftModal,
  setSelectedGiftModal,
  roadmapContent,
}) {
  const { colors } = useTheme();

  const roadmapMilestones = useMemo(() => {
    const ms = [];
    let cur = 10;
    while (cur <= 1000) {
      ms.push(cur);
      if (cur < 100)       cur += 20;
      else if (cur < 500)  cur += 30;
      else                 cur += 40;
    }
    if (!ms.includes(1000)) ms.push(1000);
    return ms;
  }, []);

  const handleMilestonePress = (milestone) => {
    const giftObj = gifts.find(g => g.streak_required === milestone);
    if (streak >= milestone) {
      setSelectedGiftModal({
        type: 'unlocked',
        streak: milestone,
        message: giftObj?.gift_text ?? 'Quà anh chưa chuẩn bị kịp, em nhắn đòi quà anh nha! 🎁',
      });
    } else {
      setSelectedGiftModal({
        type: 'locked',
        streak: milestone,
        message: `Ráng uống nước ngoan thêm chút nữa! Đạt chuỗi ${milestone} ngày để mở quà bí mật nhe 💖`,
      });
    }
  };

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {/* Floating streak badge */}
      <View style={styles.floatingStreakBadge}>
        <Ionicons name="flame" size={20} color="#f43f5e" />
        <Text style={styles.floatingStreakText}>Streak: {streak} ngày</Text>
      </View>

      <ScrollView
        contentContainerStyle={roadmapContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
      >
        <View style={[styles.roadmapHeader, { marginBottom: 20, marginTop: 70 }]}>
          <Text style={styles.roadmapTitle}>Bản đồ Quà Tặng 🎀</Text>
          <Text style={styles.roadmapSub}>Dành riêng cho "Em bé của Bình"</Text>
        </View>

        <View style={styles.roadmapPathContainer}>
          {/* Đường dọc chính chạy xuyên suốt roadmap */}
          <View style={styles.centerLine} />

          {roadmapMilestones.map((milestone, index) => {
            const isUnlocked   = streak >= milestone;
            const isCurrentNext = milestone > streak && (index === roadmapMilestones.length - 1 || streak >= roadmapMilestones[index + 1]);
            const isLeft       = index % 2 === 0;

            const nodeAndLabel = (
              <TouchableOpacity
                style={[
                  styles.milestoneNode,
                  isUnlocked    ? styles.milestoneNodeUnlocked :
                  isCurrentNext ? styles.milestoneNodeNext     :
                                  styles.milestoneNodeLocked,
                ]}
                onPress={() => handleMilestonePress(milestone)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isUnlocked ? 'gift' : 'lock-closed'}
                  size={26}
                  color={isUnlocked ? '#fff' : '#94a3b8'}
                />
                <View style={styles.milestoneLabelBox}>
                  <Text style={[styles.milestoneLabelText, isUnlocked && { color: '#f43f5e' }]}>
                    Mốc {milestone}
                  </Text>
                </View>
              </TouchableOpacity>
            );

            const connector = (
              <View style={[styles.connector, { borderTopColor: isUnlocked ? '#f43f5e' : '#cbd5e1' }]} />
            );

            return (
              <View key={milestone} style={styles.milestoneWrapper}>
                {/* Nửa trái */}
                <View style={[styles.milestoneSlot, { justifyContent: 'flex-end' }]}>
                  {isLeft && (
                    <View style={styles.slotInnerLeft}>
                      {nodeAndLabel}
                      {connector}
                    </View>
                  )}
                </View>

                {/* Chấm tròn nằm trên đường dọc */}
                <View style={[styles.centerDot, { backgroundColor: isUnlocked ? '#f43f5e' : '#cbd5e1' }]} />

                {/* Nửa phải */}
                <View style={[styles.milestoneSlot, { justifyContent: 'flex-start' }]}>
                  {!isLeft && (
                    <View style={styles.slotInnerRight}>
                      {connector}
                      {nodeAndLabel}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Modal quà tặng */}
      <Modal visible={!!selectedGiftModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: selectedGiftModal?.type === 'unlocked' ? '#fbcfe8' : colors.border, borderWidth: 3 },
          ]}>
            {selectedGiftModal?.type === 'unlocked'
              ? <Ionicons name="gift"        size={60} color="#f43f5e" style={{ marginBottom: 10 }} />
              : <Ionicons name="lock-closed" size={50} color="#94a3b8" style={{ marginBottom: 10 }} />
            }
            <Text style={[
              styles.modalTitle,
              { color: selectedGiftModal?.type === 'unlocked' ? '#f43f5e' : colors.text, textAlign: 'center' },
            ]}>
              {selectedGiftModal?.type === 'unlocked'
                ? `Đã mở — Mốc ${selectedGiftModal?.streak} ngày ✅`
                : `Mốc ${selectedGiftModal?.streak} Ngày`}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.text }]}>
              {selectedGiftModal?.message}
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, { marginTop: 24, backgroundColor: selectedGiftModal?.type === 'unlocked' ? '#f43f5e' : '#64748b' }]}
              onPress={() => setSelectedGiftModal(null)}
            >
              <Text style={styles.confirmBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
});

export default RoadmapTab;

const styles = StyleSheet.create({
  floatingStreakBadge:      { position: 'absolute', right: 20, top: 16, zIndex: 999, flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, alignItems: 'center', borderWidth: 2, borderColor: '#f43f5e', shadowColor: '#f43f5e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 },
  floatingStreakText:       { color: '#f43f5e', fontWeight: '900', marginLeft: 6, fontSize: 16 },
  roadmapHeader:            { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  roadmapTitle:             { fontSize: 28, fontWeight: '900', color: '#f43f5e', marginBottom: 6 },
  roadmapSub:               { fontSize: 14, color: '#f472b6', fontWeight: '600', marginBottom: 12 },
  roadmapPathContainer:     { position: 'relative', marginVertical: 20 },
  centerLine:               { position: 'absolute', left: '50%', marginLeft: -2, top: 0, bottom: 0, width: 4, borderLeftWidth: 4, borderStyle: 'dashed', borderColor: '#fbcfe8', zIndex: 0 },
  milestoneWrapper:         { flexDirection: 'row', alignItems: 'center', width: '100%', height: 100 },
  milestoneSlot:            { flex: 1, flexDirection: 'row', alignItems: 'center', zIndex: 2 },
  slotInnerLeft:            { flexDirection: 'row', alignItems: 'center' },
  slotInnerRight:           { flexDirection: 'row', alignItems: 'center' },
  connector:                { width: 22, height: 0, borderTopWidth: 4, borderStyle: 'dashed', marginHorizontal: 2 },
  centerDot:                { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#fff', zIndex: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 3 },
  milestoneNode:            { width: 70, height: 70, borderRadius: 35, borderWidth: 4, justifyContent: 'center', alignItems: 'center', zIndex: 10, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  milestoneNodeUnlocked:    { backgroundColor: '#f43f5e', borderColor: '#fbcfe8', shadowColor: '#f43f5e' },
  milestoneNodeNext:        { backgroundColor: '#fff', borderColor: '#f43f5e', borderStyle: 'dashed' },
  milestoneNodeLocked:      { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  milestoneLabelBox:        { position: 'absolute', bottom: -25, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  milestoneLabelText:       { fontSize: 12, fontWeight: '800', color: '#94a3b8' },
  modalOverlay:             { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalCard:                { width: '90%', maxWidth: 350, borderRadius: 32, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  modalTitle:               { fontSize: 18, fontWeight: '800' },
  modalMessage:             { fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  confirmBtn:               { width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  confirmBtnText:           { color: '#ffffff', fontSize: 16, fontWeight: '750' },
});
