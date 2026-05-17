/**
 * `<VibeIphoneMockup>` — iPhone 15 shell with iMessage-style chat.
 */

import { cn } from "@/lib/utils";

export type VibeIphoneMockupProps = {
  className?: string;
};

export function VibeIphoneMockup({ className }: VibeIphoneMockupProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      {/* iPhone 15 shell */}
      <div className="relative h-[580px] w-[275px] rounded-[50px] bg-[#1a1a1a] p-[12px] shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* Dynamic Island */}
        <div className="absolute left-1/2 top-[18px] z-20 h-[25px] w-[95px] -translate-x-1/2 rounded-full bg-black" />

        {/* Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-black">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pb-0.5 pt-[44px] text-[9px] font-semibold text-white">
            <span>14:02</span>
            <div className="flex items-center gap-1">
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </div>
          </div>

          {/* Chat header - iOS style */}
          <div className="flex flex-col items-center border-b border-white/10 pb-1.5 pt-0.5">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#fcaa67] to-[#e8913a] grid place-items-center text-[10px] font-bold text-white">
              A
            </div>
            <p className="text-[10px] font-semibold text-white">Orya</p>
            <p className="text-[8px] text-white/40">Orya</p>
          </div>

          {/* Messages - iMessage style */}
          <div className="flex h-[calc(100%-140px)] flex-col justify-end gap-1 px-2.5 pb-11">
            {/* Incoming - grey bubble */}
            <div className="flex justify-start">
              <div className="max-w-[78%] rounded-[14px] rounded-bl-[3px] bg-[#262628] px-2.5 py-1.5">
                <p className="text-[11px] leading-snug text-white">
                  Bonjour, je suis Orya, assistante chez Orya. Comment puis-je vous aider ?
                </p>
              </div>
            </div>

            {/* Outgoing - blue bubble */}
            <div className="flex justify-end">
              <div className="max-w-[78%] rounded-[14px] rounded-br-[3px] bg-[#0b84fe] px-2.5 py-1.5">
                <p className="text-[11px] leading-snug text-white">
                  Je cherche un plombier sur Bonapriso
                </p>
              </div>
            </div>

            {/* Incoming */}
            <div className="flex justify-start">
              <div className="max-w-[78%] rounded-[14px] rounded-bl-[3px] bg-[#262628] px-2.5 py-1.5">
                <p className="text-[11px] leading-snug text-white">
                  Bien sur ! Je regarde ce que j'ai pour vous.
                </p>
              </div>
            </div>

            {/* Typing indicator */}
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-[2px] rounded-[14px] rounded-bl-[3px] bg-[#262628] px-2.5 py-2">
                <span className="block h-[5px] w-[5px] animate-bounce rounded-full bg-white/40" style={{ animationDelay: "0ms" }} />
                <span className="block h-[5px] w-[5px] animate-bounce rounded-full bg-white/40" style={{ animationDelay: "150ms" }} />
                <span className="block h-[5px] w-[5px] animate-bounce rounded-full bg-white/40" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>

          {/* Input bar - iOS style */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/90 px-2.5 py-2 backdrop-blur">
            <div className="flex flex-1 items-center rounded-full border border-white/20 px-3 py-1">
              <span className="text-[10px] text-white/30">iMessage</span>
            </div>
            <div className="grid h-5 w-5 place-items-center rounded-full bg-[#0b84fe]">
              <ArrowUpIcon />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────── */

function ArrowUpIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 24 16" fill="white">
      <rect x="0" y="10" width="4" height="6" rx="1" /><rect x="5" y="7" width="4" height="9" rx="1" /><rect x="10" y="4" width="4" height="12" rx="1" /><rect x="15" y="1" width="4" height="15" rx="1" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 24 18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
      <path d="M1 7c3-3 7-5 11-5s8 2 11 5" /><path d="M5 11c2-2 4.5-3 7-3s5 1 7 3" /><path d="M9 15c1-1 2-1.5 3-1.5s2 .5 3 1.5" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="22" height="11" viewBox="0 0 25 12" fill="none">
      <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="white" strokeOpacity="0.7" />
      <rect x="2" y="2" width="16" height="8" rx="1.5" fill="white" />
      <path d="M23 4v4a2 2 0 0 0 0-4Z" fill="white" fillOpacity="0.5" />
    </svg>
  );
}
