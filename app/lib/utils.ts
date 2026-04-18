// YouTubeのURLから動画IDを抽出するヘルパー関数
export const extractYouTubeIds = (text: string): string[] => {
  if (!text) return [];
  const ids: string[] = [];
  const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return Array.from(new Set(ids));
};

// 今日の日付を YYYY-MM-DD 形式で返す
export const getTodayString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
