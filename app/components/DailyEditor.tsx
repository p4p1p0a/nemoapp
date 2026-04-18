"use client";

interface DailyEditorProps {
  todayTitle: string;
  dailyContent: string;
  setDailyContent: (v: string) => void;
  handleDailySave: () => void;
}

export const DailyEditor = ({
  todayTitle,
  dailyContent,
  setDailyContent,
  handleDailySave,
}: DailyEditorProps) => {
  return (
    <section className="flex flex-col gap-4 animate-fade-in mt-10 mb-16">
      <header className="mb-4 text-center">
        <span className="text-4xl block mb-4">☀️</span>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
          {todayTitle} の日記
        </h1>
        <p className="text-white/40 text-sm border border-white/10 inline-block px-4 py-1 rounded-full mt-2">
          毎日の日記は自動的に「日記」フォルダに分類されて保存されます。
        </p>
      </header>

      <div className="relative group max-w-2xl mx-auto w-full">
        <textarea
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-8 text-base outline-none focus:border-white/40 transition-all resize-none min-h-[300px] leading-relaxed placeholder:text-white/20 shadow-xl"
          placeholder="ここにMarkdown感覚で入力..."
          value={dailyContent}
          onChange={e => setDailyContent(e.target.value)}
          autoFocus
        />
        <div className="absolute bottom-6 right-6">
          <button
            onClick={handleDailySave}
            disabled={!dailyContent.trim()}
            className="bg-white text-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.2)]"
          >
            保存してワークスペースへ
          </button>
        </div>
      </div>
    </section>
  );
};
