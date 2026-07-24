export function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Kecha';

  return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < 0) {
    return formatTime(dateString);
  }

  if (diffMs < minute) return 'Hozirgina';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} daqiqa oldin`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} soat oldin`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} kun oldin`;

  return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });
}

export function contactDisplayName(contact: {
  name: string | null;
  username: string | null;
  instagramScopedId: string;
}): string {
  return contact.name || contact.username || `Foydalanuvchi ${contact.instagramScopedId.slice(-6)}`;
}
