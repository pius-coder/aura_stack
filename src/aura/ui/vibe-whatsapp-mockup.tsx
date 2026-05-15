/**
 * `<VibeWhatsAppMockup>` — high-fidelity WhatsApp interface mockup.
 *
 * Mirrors the actual WhatsApp dark-theme chat UI:
 *  - Header bar with avatar, name, online status
 *  - Conversation surface with subtle pattern
 *  - Sender bubbles (user = teal-green, bot = dark grey)
 *  - Message timestamps + delivery ticks
 *  - Sticky bottom input row
 *
 * No fictional chat-AI styling. This looks like an actual WhatsApp screenshot
 * because that's exactly what the user sees when chatting with the Vibe bot.
 *
 * References (rephrased for compliance with licensing): WhatsApp Web dark
 * theme color tokens (header #202c33, paper #0b141a, user bubble #005c4b,
 * incoming bubble #1f2c33, ticks #4fc3f7).
 */

export type VibeWhatsAppMockupProps = {
  className?: string;
};

type Msg =
  | { from: "user"; text: string; time: string }
  | { from: "bot"; text: React.ReactNode; time: string };

export function VibeWhatsAppMockup({ className }: VibeWhatsAppMockupProps) {
  const messages: Msg[] = [
    {
      from: "user",
      text: "Salut, je cherche un plombier à Bonapriso pour un chauffe-eau.",
      time: "10:42",
    },
    {
      from: "bot",
      text: (
        <>
          <p className="mb-2.5">
            Bonjour. J'ai trouvé{" "}
            <strong className="font-semibold text-white">3 prestataires</strong>{" "}
            qui correspondent.
          </p>
          <ul className="space-y-2 text-[13.5px] leading-snug">
            <li className="flex gap-2">
              <span className="text-[var(--vibe-accent)]">1.</span>
              <span>
                <strong className="font-semibold text-white">Lion Rapide</strong>
                <br />
                Plombier · Bonapriso · ⭐ 4,8 (32&nbsp;avis)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--vibe-accent)]">2.</span>
              <span>
                <strong className="font-semibold text-white">Aigle Calme</strong>
                <br />
                Plombier-élec · Bali · ⭐ 4,6 (19&nbsp;avis)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--vibe-accent)]">3.</span>
              <span>
                <strong className="font-semibold text-white">Panthère Vive</strong>
                <br />
                Spécialiste chauffe-eau · ⭐ 4,9 (48&nbsp;avis)
              </span>
            </li>
          </ul>
          <p className="mt-3 text-[13px] text-[var(--wa-text-muted-dark)]">
            Répondez 1, 2 ou 3 pour envoyer une demande.
          </p>
        </>
      ),
      time: "10:42",
    },
    { from: "user", text: "3", time: "10:43" },
  ];

  return (
    <div
      className={
        "relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/10 bg-[#101a1d] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] " +
        (className ?? "")
      }
      style={{
        // Phone-like aspect for the mockup window
        aspectRatio: "9 / 16",
      }}
    >
      {/* Phone notch (decorative) */}
      <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />

      {/* WhatsApp header */}
      <div
        className="relative z-10 flex items-center gap-3 px-4 py-3 pt-7"
        style={{ background: "var(--wa-header-dark)" }}
      >
        <ArrowBackIcon />
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--wa-text-dark)]">
            Vibe Assistant
          </p>
          <p className="truncate text-[11.5px] text-[var(--wa-text-muted-dark)]">
            en ligne
          </p>
        </div>
        <VideoCallIcon />
        <PhoneCallIcon />
        <DotsVerticalIcon />
      </div>

      {/* Chat surface */}
      <div className="wa-surface relative h-[calc(100%-104px)] overflow-y-auto px-3 pb-2 pt-3">
        <DateChip>Aujourd'hui</DateChip>

        {messages.map((m, i) => (
          <Bubble key={i} {...m} />
        ))}

        {/* Typing indicator */}
        <div className="mb-2 flex">
          <div
            className="wa-bubble-bot inline-flex items-center gap-1 px-3 py-2"
            style={{ background: "var(--wa-bubble-bot-dark)" }}
          >
            <span
              className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white/60"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white/60"
              style={{ animationDelay: "200ms" }}
            />
            <span
              className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white/60"
              style={{ animationDelay: "400ms" }}
            />
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-3 py-2"
        style={{ background: "var(--wa-header-dark)" }}
      >
        <SmileyIcon />
        <div className="flex flex-1 items-center gap-2 rounded-full bg-[#2a3942] px-3 py-2">
          <span className="text-[13px] text-[var(--wa-text-muted-dark)]">
            Message…
          </span>
          <span className="ml-auto flex items-center gap-2 text-[var(--wa-text-muted-dark)]">
            <PaperclipIcon />
            <CameraIcon />
          </span>
        </div>
        <button
          aria-label="Send"
          className="grid h-9 w-9 place-items-center rounded-full text-white"
          style={{ background: "var(--wa-bubble-user-dark)" }}
        >
          <MicIcon />
        </button>
      </div>
    </div>
  );
}

/* ── Bubble + chip ───────────────────────────────────────────── */

function Bubble({ from, text, time }: Msg) {
  if (from === "user") {
    return (
      <div className="mb-1.5 flex justify-end">
        <div className="wa-bubble-user max-w-[78%] px-3 py-1.5 shadow-[0_1px_0_rgba(0,0,0,0.13)]">
          <p className="text-[14px] leading-snug text-[var(--wa-text-dark)]">{text}</p>
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-white/55">
            {time}
            <DoubleTickIcon />
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-1.5 flex">
      <div className="wa-bubble-bot max-w-[82%] px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.18)]">
        <div className="text-[14px] leading-snug text-[var(--wa-text-dark)]">
          {text}
        </div>
        <p className="mt-1 text-[10.5px] text-[var(--wa-text-muted-dark)]">
          {time}
        </p>
      </div>
    </div>
  );
}

function DateChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex justify-center">
      <span className="rounded-md bg-[#1d2a30]/90 px-2.5 py-1 text-[11px] font-medium text-[var(--wa-text-muted-dark)] shadow-[0_1px_0_rgba(0,0,0,0.16)]">
        {children}
      </span>
    </div>
  );
}

/* ── Inline icon set (no extra dep) ──────────────────────────── */

function Avatar() {
  return (
    <div
      aria-hidden="true"
      className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold text-white"
      style={{
        background:
          "radial-gradient(circle at 30% 25%, #2ec788, var(--vibe-accent-pressed))",
      }}
    >
      V
    </div>
  );
}

const stroke = "currentColor";
function ArrowBackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--wa-text-muted-dark)]">
      <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
    </svg>
  );
}
function VideoCallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--wa-text-muted-dark)]">
      <path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
    </svg>
  );
}
function PhoneCallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--wa-text-muted-dark)]">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
function DotsVerticalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--wa-text-muted-dark)]">
      <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  );
}
function SmileyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" className="text-[var(--wa-text-muted-dark)]">
      <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function DoubleTickIcon() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
      <path d="M1 5.5 4 8.5 9 3" stroke="var(--wa-tick)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6 5.5 9 8.5 14 3" stroke="var(--wa-tick)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
