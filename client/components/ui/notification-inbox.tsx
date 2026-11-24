"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { buttonClasses, EmptyState, LoadingState } from "@/components/head/ui";
import { Icon } from "@/components/ui/icon";
import { formatDateTime } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { loadInbox, notificationLink, readInboxThrough, readNotification, type InboxItem } from "@/lib/notifications";

export function NotificationInbox({ role }: { role: string }) {
  const panelId = useId();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { data, error, reload } = useResource(loadInbox);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [older, setOlder] = useState<{ items: InboxItem[]; next: number | null } | null>(null);
  const unread = data?.unread ?? 0;
  const items = [...new Map([...(older?.items ?? []), ...(data?.items ?? [])].map(item => [item.id, item])).values()]
    .sort((a, b) => b.id - a.id);
  const next = older ? older.next : data?.next;
  const reloadRef = useRef(reload);

  useEffect(() => { reloadRef.current = reload; }, [reload]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") reloadRef.current(); };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      if (root.current?.contains(document.activeElement)) trigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  async function update(work: () => Promise<void>, failure: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch {
      setMessage(failure);
    } finally {
      setBusy(false);
    }
  }

  function activate(item: InboxItem) {
    const href = notificationLink(role, item.recommendationId);
    void update(async () => {
      if (!item.readAt) {
        await readNotification(item.id);
        setOlder(current => current && {
          ...current, items: current.items.map(row => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row),
        });
        reload();
      }
      if (href) {
        setOpen(false);
        router.push(href);
      }
    }, "Не вдалося відкрити сповіщення. Оновіть список і спробуйте ще раз.");
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-label={unread > 0 ? `Сповіщення, непрочитаних ${unread}` : "Сповіщення"}
        onClick={() => {
          if (!open) { setOlder(null); setMessage(""); reload(); }
          setOpen(!open);
        }}
        className="relative grid size-9 place-items-center rounded-md border border-[#e2e8e5] bg-white text-[#334155] hover:bg-[#f8faf9]">
        <Icon name="bell" size={18} />
        {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#0f766e] px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <section id={panelId} aria-label="Сповіщення" className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-5rem))] overflow-hidden rounded-xl border border-[#e2e8e5] bg-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8e5] px-4 py-3">
            <h2 className="font-semibold">Сповіщення</h2>
            {unread > 0 && items.length > 0 && (
              <button type="button" disabled={busy} className="text-xs font-medium text-[#0f766e] hover:underline disabled:opacity-50"
                onClick={() => void update(async () => {
                  await readInboxThrough(items[0].id);
                  setOlder(null);
                  reload();
                }, "Не вдалося позначити сповіщення прочитаними.")}>Прочитати всі</button>
            )}
          </div>
          <div className="max-h-[min(65svh,28rem)] overflow-y-auto overscroll-contain">
            {(error !== undefined || message) && (
              <div className="p-4 text-sm">
                <p role="alert" className="text-[#b91c1c]">{message || "Не вдалося завантажити сповіщення."}</p>
                <button type="button" className={buttonClasses.secondary + " mt-2"} onClick={() => { setOlder(null); setMessage(""); reload(); }}>Оновити</button>
              </div>
            )}
            {items.length === 0 && error === undefined && (
              data ? <EmptyState title="Сповіщень поки немає" /> : <LoadingState />
            )}
            <ul className="divide-y divide-[#e2e8e5]">
              {items.map(item => (
                <li key={item.id}>
                  <button type="button" disabled={busy} onClick={() => activate(item)}
                    className={"block w-full px-4 py-3 text-left hover:bg-[#f8faf9] disabled:opacity-60 " + (!item.readAt ? "bg-[#ecfdf5]" : "")}>
                    <span className="block text-sm font-semibold">{item.title}{!item.readAt && <span className="sr-only">, непрочитане</span>}</span>
                    <span className="mt-1 block break-words text-xs text-[#475569]">{item.message}</span>
                    <time dateTime={item.createdAt} className="mt-1 block text-xs text-[#64748b]">{formatDateTime(item.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
            {next != null && (
              <button type="button" disabled={busy} className="w-full border-t border-[#e2e8e5] p-3 text-sm font-medium text-[#0f766e] hover:bg-[#f8faf9] disabled:opacity-50"
                onClick={() => void update(async () => {
                  const page = await loadInbox(next);
                  setOlder(current => ({ items: [...(current?.items ?? []), ...page.items], next: page.next }));
                }, "Не вдалося завантажити попередні сповіщення.")}>Показати старіші</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
