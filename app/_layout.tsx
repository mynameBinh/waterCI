import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,      // Ẩn header mặc định của expo-router (nguồn gây khoảng trắng phía trên)
        contentStyle: { flex: 1 }, // Đảm bảo vùng content giãn hết màn hình, không bị co lại
        animation: 'none',
      }}
    />
  );
}
