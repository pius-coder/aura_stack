/**
 * `<VibeIphoneMockup>` — iPhone 15 shell with WhatsApp chat inside.
 *
 * Shell structure from the provided component (Dynamic Island, side buttons,
 * inner border ring). Screen content = high-fidelity WhatsApp dark chat.
 */

import { cn } from "@/lib/utils";

export type VibeIphoneMockupProps = {
  className?: string;
};

export function VibeIphoneMockup({ className }: VibeIphoneMockupProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      {/* iPhone 15 Container */}
      <div className="relative h-[600px] w-72 rounded-[45px] border-8 border-zinc-900 shadow-[0_0_2px_2px_rgba(255,255,255,0.1)]">
        {/* Dynamic Island */}
        <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-zinc-900" />

        {/* Inner border ring */}
        <div className="pointer-events-none absolute -inset-[1px] rounded-[37px] border-[3px] border-zinc-700/40" />

        {/* Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[37px] bg-[#0b141a]">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pb-1 pt-8 text-[10px] font-semibold text-white/80">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </div>
          </div>

          {/* WhatsApp header */}
          <div className="flex items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
            <button className="text-[#aebac1]">
              <ChevronLeftIcon />
            </button>
            {/* Avatar */}
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
              style={{
                background:
                  "radial-gradient(circle at 30% 25%, #2ec788, #18a065)",
              }}
            >
              V
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#e9edef]">
                Vibe Assistant
              </p>
              <p className="text-[10.5px] text-[#8696a0]">en ligne</p>
            </div>
            <VideoIcon />
            <PhoneIcon />
            <DotsIcon />
          </div>

          {/* Chat area */}
          <div
            className="flex h-[calc(100%-130px)] flex-col overflow-y-auto px-2.5 pb-2 pt-3"
            style={{ background: "var(--wa-paper-dark, #0b141a)" }}
          >
            <DateChip>Aujourd'hui</DateChip>

            <UserBubble time="10:42">
              Salut, je cherche un plombier à Bonapriso pour un chauffe-eau.
            </UserBubble>

            <BotBubble time="10:42">
              <p className="mb-2">
                Bonjour. J'ai trouvé{" "}
                <strong className="font-semibold text-white">
                  3 prestataires
                </strong>{" "}
                qui correspondent.
              </p>
              <ul className="space-y-1.5 text-[12px]">
                <li className="flex gap-1.5">
                  <span className="text-[#1fb573]">1.</span>
                  <span>
                    <strong className="font-medium text-white">
                      Lion Rapide
                    </strong>{" "}
                    · Plombier · ⭐ 4,8
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <span className="text-[#1fb573]">2.</span>
                  <span>
                    <strong className="font-medium text-white">
                      Aigle Calme
                    </strong>{" "}
                    · Plombier-élec · ⭐ 4,6
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <span className="text-[#1fb573]">3.</span>
                  <span>
                    <strong className="font-medium text-white">
                      Panthère Vive
                    </strong>{" "}
                    · Chauffe-eau · ⭐ 4,9
                  </span>
                </li>
              </ul>
              <p className="mt-2 text-[11px] text-[#8696a0]">
                Répondez 1, 2 ou 3 pour envoyer une demande.
              </p>
            </BotBubble>

            <UserBubble time="10:43">3</UserBubble>

            <BotBubble time="10:43">
              Demande envoyée à{" "}
              <strong className="font-medium text-white">Panthère Vive</strong>
              . Vous serez notifié dès qu'il accepte.
            </BotBubble>

            {/* Typing indicator */}
            <div className="mb-1 flex">
              <div className="inline-flex items-center gap-1 rounded-[4px_12px_12px_12px] bg-[#1f2c33] px-3 py-2">
                <span
                  className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-[#202c33] px-2.5 py-2">
            <SmileyIcon />
            <div className="flex flex-1 items-center gap-2 rounded-full bg-[#2a3942] px-3 py-2">
              <span className="text-[12px] text-[#8696a0]">Message…</span>
              <span className="ml-auto flex items-center gap-1.5 text-[#8696a0]">
                <PaperclipIcon />
                <CameraIcon />
              </span>
            </div>
            <button
              aria-label="Send"
              className="grid h-8 w-8 place-items-center rounded-full text-white"
              style={{ background: "#005c4b" }}
            >
              <MicIcon />
            </button>
          </div>
        </div>

        {/* Left Side Buttons */}
        {/* Silent Switch */}
        <div className="absolute left-[-12px] top-20 h-8 w-[6px] rounded-l-md bg-zinc-900 shadow-md" />
        {/* Volume Up */}
        <div className="absolute left-[-12px] top-36 h-12 w-[6px] rounded-l-md bg-zinc-900 shadow-md" />
        {/* Volume Down */}
        <div className="absolute left-[-12px] top-52 h-12 w-[6px] rounded-l-md bg-zinc-900 shadow-md" />
        {/* Right Side Button (Power) */}
        <div className="absolute right-[-12px] top-36 h-16 w-[6px] rounded-r-md bg-zinc-900 shadow-md" />
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function DateChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex justify-center">
      <span className="rounded-md bg-[#1d2a30]/90 px-2 py-0.5 text-[10px] font-medium text-[#8696a0]">
        {children}
      </span>
    </div>
  );
}

function UserBubble({
  children,
  time,
}: {
  children: React.ReactNode;
  time: string;
}) {
  return (
    <div className="mb-1 flex justify-end">
      <div className="max-w-[80%] rounded-[12px_4px_12px_12px] bg-[#005c4b] px-3 py-1.5 shadow-sm">
        <p className="text-[13px] leading-snug text-[#e9edef]">{children}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-white/50">
          {time}
          <DoubleTick />
        </p>
      </div>
    </div>
  );
}

function BotBubble({
  children,
  time,
}: {
  children: React.ReactNode;
  time: string;
}) {
  return (
    <div className="mb-1 flex">
      <div className="max-w-[85%] rounded-[4px_12px_12px_12px] bg-[#1f2c33] px-3 py-2 shadow-sm">
        <div className="text-[13px] leading-snug text-[#e9edef]">
          {children}
        </div>
        <p className="mt-1 text-[10px] text-[#8696a0]">{time}</p>
      </div>
    </div>
  );
}

/* ── Inline icons ────────────────────────────────────────────── */

const s = "currentColor";

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#aebac1]">
      <path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#aebac1]">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-[#aebac1]">
      <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  );
}
function SmileyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.7" className="shrink-0 text-[#8696a0]">
      <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function DoubleTick() {
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none">
      <path d="M1 5.5 4 8.5 9 3" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5.5 9 8.5 14 3" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="M1 7c3-3 7-5 11-5s8 2 11 5" /><path d="M5 11c2-2 4.5-3 7-3s5 1 7 3" /><path d="M9 15c1-1 2-1.5 3-1.5s2 .5 3 1.5" /><circle cx="12" cy="18" r="1.5" fill="white" stroke="none" />
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
