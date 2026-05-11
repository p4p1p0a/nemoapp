"use client";

interface DailyEditorProps {
  todayTitle: string;
  dailyContent: string;
  setDailyContent: (v: string) => void;
  dailyColor: string;
  setDailyColor: (v: string) => void;
  handleDailySave: () => void;
}

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

      <div className="relative group max-w-3xl mx-auto w-full z-10 flex gap-4 items-start">
        <textarea
          className="flex-1 bg-sidebar-bg border border-border-color rounded-xl p-8 text-base outline-none focus:border-foreground/30 transition-all resize-none min-h-[300px] leading-relaxed placeholder:text-foreground/20 shadow-xl"
          style={{ borderTopColor: dailyColor, borderTopWidth: dailyContent ? '4px' : '1px' }}
          placeholder="ここにMarkdown感覚で入力..."
          value={dailyContent}
          onChange={e => setDailyContent(e.target.value)}
          autoFocus
        />

        <div className="flex flex-col items-center gap-2 mt-4">
          <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Color</label>
          <div 
            className="w-10 h-10 rounded-full border-2 border-white/20 overflow-hidden relative cursor-pointer hover:scale-110 transition-transform shadow-lg"
            title="テーマカラーを変更"
          >
            <input
              type="color"
              value={dailyColor}
              onChange={e => setDailyColor(e.target.value)}
              className="absolute -top-4 -left-4 w-20 h-20 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center z-10 relative">
        <button
          onClick={handleDailySave}
          disabled={!dailyContent.trim()}
          className="bg-accent-blue text-white px-8 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex items-center gap-2"
        >
          <span>✨</span> 保存してワークスペースへ
        </button>
      </div>
    </section>
  );
};
