import axios, { AxiosError } from 'axios';
import { InstagramApiError } from '../lib/errors';

const GRAPH_BASE = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v23.0';

export interface InstagramProfile {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  accountType?: string;
}

export interface ContactProfile {
  name?: string;
  username?: string;
  profilePictureUrl?: string;
}

// Meta xato javobidan token chiqib ketmasligi uchun faqat error obyektini oqiymiz.
function toInstagramError(err: unknown): InstagramApiError {
  if (err instanceof AxiosError) {
    const metaError = err.response?.data?.error as
      | { message?: string; code?: number; error_user_msg?: string }
      | undefined;
    if (metaError) {
      const message = metaError.error_user_msg || metaError.message || 'Instagram API xatosi';
      const status = err.response?.status === 401 || metaError.code === 190 ? 401 : 502;
      return new InstagramApiError(`Instagram API: ${message}`, status, metaError.code);
    }
    return new InstagramApiError('Instagram API bilan boglanib bolmadi', 502);
  }
  return new InstagramApiError('Instagram API xatosi', 502);
}

// Access token orqali ulangan biznes akkaunt malumotlarini tekshiradi.
export async function fetchMe(accessToken: string): Promise<InstagramProfile> {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/me`, {
      params: {
        fields: 'id,username,name,profile_picture_url,account_type',
        access_token: accessToken,
      },
      timeout: 15_000,
    });
    if (!data?.id || !data?.username) {
      throw new InstagramApiError('Instagram API kutilgan malumotni qaytarmadi', 502);
    }
    return {
      id: String(data.id),
      username: data.username,
      name: data.name ?? undefined,
      profilePictureUrl: data.profile_picture_url ?? undefined,
      accountType: data.account_type ?? undefined,
    };
  } catch (err) {
    if (err instanceof InstagramApiError) throw err;
    throw toInstagramError(err);
  }
}

// DM yozgan foydalanuvchi profili (Instagram Scoped ID orqali).
// Ruxsat bolmasa yoki xato qaytsa null qaytaradi — xabar saqlash davom etadi.
export async function fetchContactProfile(
  accessToken: string,
  instagramScopedId: string,
): Promise<ContactProfile | null> {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${GRAPH_VERSION}/${instagramScopedId}`, {
      params: {
        fields: 'name,username,profile_pic',
        access_token: accessToken,
      },
      timeout: 15_000,
    });
    return {
      name: data?.name ?? undefined,
      username: data?.username ?? undefined,
      profilePictureUrl: data?.profile_pic ?? undefined,
    };
  } catch {
    console.warn(`[instagram] Kontakt profili olinmadi (IGSID: ${instagramScopedId})`);
    return null;
  }
}

// Instagram Send API orqali matnli xabar yuborish.
export async function sendTextMessage(
  accessToken: string,
  recipientIgsid: string,
  text: string,
): Promise<{ messageId: string }> {
  try {
    const { data } = await axios.post(
      `${GRAPH_BASE}/${GRAPH_VERSION}/me/messages`,
      {
        recipient: { id: recipientIgsid },
        message: { text },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15_000,
      },
    );
    if (!data?.message_id) {
      throw new InstagramApiError('Instagram xabar ID qaytarmadi', 502);
    }
    return { messageId: String(data.message_id) };
  } catch (err) {
    if (err instanceof InstagramApiError) throw err;
    throw toInstagramError(err);
  }
}
