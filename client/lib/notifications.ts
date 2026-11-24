import { apiRequest } from "@/lib/auth";

export type InboxItem = {
  id: number;
  title: string;
  message: string;
  recommendationId: number | null;
  createdAt: string;
  readAt: string | null;
};

type InboxPage = { items: InboxItem[]; next: number | null; unread: number };
const inbox = "notifications/inbox";

export function loadInbox(before?: number): Promise<InboxPage> {
  return apiRequest(inbox + (before === undefined ? "" : "?before=" + before));
}

export function readNotification(id: number): Promise<void> {
  return apiRequest(inbox + "/" + id + "/read", "POST");
}

export function readInboxThrough(id: number): Promise<void> {
  return apiRequest(inbox + "/read-through/" + id, "POST");
}

export function notificationLink(role: string, id: number | null) {
  if (id === null) return null;
  switch (role) {
    case "manager": return "/manager/transfer/" + id;
    case "head": return "/head/moves/" + id;
    case "logist": return "/logist/transfer/" + id;
    default: return null;
  }
}
