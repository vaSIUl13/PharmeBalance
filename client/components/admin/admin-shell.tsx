"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, authRequest } from "@/lib/auth";
import { loadPrincipal } from "@/lib/admin/api";
import { useResource } from "@/lib/head/use-resource";
import { Icon, type IconName } from "@/components/ui/icon";
import { ErrorState, LoadingState } from "@/components/head/ui";

const adminNavigation: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/admin/users", label: "Користувачі", short: "Люди", icon: "users" },
  { href: "/admin/pharmacies", label: "Аптеки", short: "Аптеки", icon: "pin" },
  { href: "/admin/drugs", label: "Довідник препаратів", short: "Ліки", icon: "box" },
  { href: "/admin/rights", label: "Права доступу", short: "Права", icon: "sliders" },
  { href: "/admin/audit", label: "Журнал аудиту", short: "Аудит", icon: "file" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: principal, error, reload } = useResource(loadPrincipal);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  const unauthorized = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (unauthorized) {
      const next = pathname === "/superadmin/registration-requests"
        ? "?next=" + encodeURIComponent(pathname + window.location.search) : "";
      router.replace("/login" + next);
    }
  }, [unauthorized, pathname, router]);

  async function signOut() {
    if (signingOut) return;
    setSignOutError(false);
    setSigningOut(true);
    try {
      await authRequest("logout", "POST");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setSigningOut(false);
        setSignOutError(true);
        return;
      }
    }
    window.location.replace("/login");
  }

  if (!principal) {
    return (
      <main className="grid min-h-svh place-items-center bg-[#f8faf9] p-6 text-[#0f172a]">
        <div className="w-full max-w-md rounded-xl border border-[#e2e8e5] bg-white">
          {error && !unauthorized
            ? <ErrorState message="Не вдалося завантажити сеанс." onRetry={reload} />
            : <LoadingState />}
        </div>
      </main>
    );
  }

  const isSuperadmin = principal.role === "superadmin";
  const ownerConsole = pathname.startsWith("/superadmin");
  if (ownerConsole ? !isSuperadmin : principal.role !== "admin" && !isSuperadmin) {
    return (
      <main className="grid min-h-svh place-items-center bg-[#f8faf9] p-6 text-[#0f172a]">
        <div className="w-full max-w-md space-y-3 rounded-xl border border-[#e2e8e5] bg-white p-6">
          <h1 className="text-lg font-semibold">Розділ недоступний</h1>
          <p className="text-sm text-[#475569]">Цей розділ призначений для адміністратора.</p>
          <Link className="text-sm text-[#0f766e] underline" href="/account">До облікового запису</Link>
        </div>
      </main>
    );
  }

  const navigation = adminNavigation.map(item => ({
    ...item, href: ownerConsole ? item.href.replace("/admin/", "/superadmin/") : item.href,
  }));
  if (ownerConsole && principal.permissions.includes("REGISTRATION_REVIEW")) {
    navigation.push({ href: "/superadmin/registration-requests", label: "Запити на реєстрацію", short: "Запити", icon: "check" });
  }

  const active = (href: string) => pathname.startsWith(href);
  const title = navigation.find(item => active(item.href))?.label ?? "Адміністрування";

  return (
    <div className="min-h-svh bg-[#f8faf9] text-[#0f172a] md:grid md:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-[#e2e8e5] bg-white md:sticky md:top-0 md:flex md:h-svh md:flex-col">
        <div className="flex items-center gap-3 p-4">
          <Image src="/assets/icons/logo.svg" alt="" width={36} height={36} />
          <div className="min-w-0">
            <p className="font-semibold">PharmaBalance</p>
            <p className="truncate text-xs text-[#64748b]">{isSuperadmin ? "Суперадміністратор" : "Адміністратор"}</p>
          </div>
        </div>
        <nav aria-label="Основна навігація" className="flex-1 space-y-1 px-3">
          {navigation.map(item => (
            <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}
              className={"flex min-h-10 items-center gap-3 rounded-md px-3 text-sm " +
                (active(item.href) ? "bg-[#ecfdf5] font-semibold text-[#0f766e]" : "text-[#475569] hover:bg-[#f8faf9]")}>
              <Icon name={item.icon} size={18} />{item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-[#e2e8e5] p-4 text-sm">
          <div className="flex items-center gap-2 text-[#475569]">
            <Icon name="user" size={16} /><span className="truncate">{principal.email}</span>
          </div>
          <button type="button" onClick={signOut} disabled={signingOut}
            className="flex items-center gap-2 text-[#475569] hover:underline disabled:opacity-60">
            <Icon name="logout" size={16} />Вийти
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-[#e2e8e5] bg-white px-4 md:px-6">
          <Image className="md:hidden" src="/assets/icons/logo.svg" alt="" width={28} height={28} />
          <p className="text-base font-semibold">{title}</p>
          <button type="button" onClick={signOut} disabled={signingOut} aria-label="Вийти"
            className="ml-auto grid size-9 place-items-center rounded-md border border-[#e2e8e5] md:hidden">
            <Icon name="logout" size={16} />
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1200px] space-y-4 p-4 md:p-6">{signOutError && <p role="alert">Не вдалося вийти. Спробуйте ще раз.</p>}{children}</main>
      </div>

      <nav aria-label="Основна навігація" style={{ gridTemplateColumns: "repeat(" + navigation.length + ", minmax(0, 1fr))" }}
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-[#e2e8e5] bg-white md:hidden">
        {navigation.map(item => (
          <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}
            className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] " +
              (active(item.href) ? "font-semibold text-[#0f766e]" : "text-[#475569]")}>
            <Icon name={item.icon} size={20} />{item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
