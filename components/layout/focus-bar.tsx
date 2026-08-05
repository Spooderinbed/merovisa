import { Logo } from "./logo";

export function FocusBar({ signedIn = false }: { signedIn?: boolean } = {}) {
  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex h-[60px] w-full max-w-[1120px] items-center justify-between px-5">
        <Logo />
        {signedIn ? null : (
          <span className="hidden items-center gap-2 text-small text-ink-soft sm:inline-flex">
            <svg aria-hidden viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            </svg>
            no sign-up to start
          </span>
        )}
      </div>
    </header>
  );
}
