import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[15%] h-[40vw] w-[40vw] rounded-full bg-blue-200/30 blur-[7rem]" />
        <div className="absolute -bottom-[20%] -left-[15%] h-[50vw] w-[50vw] rounded-full bg-sky-200/20 blur-[8rem]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.09) 1px, transparent 0)",
            backgroundSize: "2rem 2rem",
          }}
        />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-black tracking-[-0.06em] text-slate-950">
            Orya
          </Link>
          <p className="mt-2 text-sm text-slate-500 font-light">{subtitle}</p>
        </div>

        <div className="rounded-2xl bg-white/72 backdrop-blur border border-white p-6 shadow-card">
          <h1 className="text-lg font-medium text-slate-950 mb-4">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
