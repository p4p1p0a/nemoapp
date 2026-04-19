"use client";

interface DailyEditorProps {
  todayTitle: string;
  dailyContent: string;
  setDailyContent: (v: string) => void;
  dailyColor: string;
  setDailyColor: (v: string) => void;
  handleDailySave: () => void;
}

const COLORS = [
  { val: '#3b82f6', label: '標準' },
  { val: '#10b981', label: '穏やか' },
  { val: '#f43f5e', label: 'ハッピー' },
  { val: '#f59e0b', label: '集中' },
  { val: '#8b5cf6', label: 'リラックス' },
];

export const DailyEditor = ({
  todayTitle,
  dailyContent,
  setDailyContent,
  dailyColor,
  setDailyColor,
  handleDailySave,
}: DailyEditorProps) => {
  return (
    <section className="flex flex-col gap-4 animate-fade-in mt-10 mb-16 relative">
      {/* コーナー装飾 */}
      <div 
        className="absolute -top-4 -right-4 w-24 h-24 pointer-events-none transition-all duration-500 z-0 opacity-40"
        style={{
          background: `radial-gradient(circle at top right, ${dailyColor}, transparent 70%)`,
        }}
      />

      <header className="mb-4 text-center">
        <span className="text-4xl block mb-4">☀️</span>
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          {todayTitle} の日記
        </h1>
        <p className="text-foreground/40 text-sm border border-border-color inline-block px-4 py-1 rounded-full mt-2">
          今日の色は、どんな気分？
        </p>
      </header>

      <div className="relative group max-w-2xl mx-auto w-full z-10">
        <textarea
          className="w-full bg-sidebar-bg border border-border-color rounded-xl p-8 text-base outline-none focus:border-foreground/30 transition-all resize-none min-h-[300px] leading-relaxed placeholder:text-foreground/20 shadow-xl"
          style={{ borderTopColor: dailyColor, borderTopWidth: dailyContent ? '4px' : '1px' }}
          placeholder="ここにMarkdown感覚で入力..."
          value={dailyContent}
          onChange={e => setDailyContent(e.target.value)}
          autoFocus
        />

        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="flex gap-4">
            {COLORS.map(c => (
              <button
                key={c.val}
                onClick={() => setDailyColor(c.val)}
                title={c.label}
                className={`w-10 h-10 rounded-full transition-all duration-300 border-2 ${
                  dailyColor === c.val ? 'scale-125 border-white shadow-lg' : 'border-transparent hover:scale-110 opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.val }}
              />
            ))}
          </div>
          
          <div className="flex justify-center mt-4">
            <button
              onClick={handleDailySave}
              disabled={!dailyContent.trim()}
              className="bg-accent-blue text-white px-8 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex items-center gap-2"
            >
              <span>✨</span> 保存してワークスペースへ
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
