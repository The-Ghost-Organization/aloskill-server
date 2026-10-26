/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { getDatabaseClient as db } from '../../config/database.js';
import { config } from '../../config/env.js';
import type { VideoUploadJob } from '../../generated/client.js';
import { AppError } from '../../middleware/errorHandler.js';

function encryptionKey(): Buffer {
  const key = Buffer.from(config.VIDEO_TOKEN_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new AppError('Configure a 32-byte video token encryption key.', 503);
  }
  return key;
}
export function encryptToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decryptToken(value: string): string {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

// Provider errors are deliberately sanitized: never log resumable URLs or tokens.
export async function checked(response: Response): Promise<Response> {
  if (response.ok || response.status === 308) {
    return response;
  }
  let reason = 'requestFailed';
  try {
    const body = (await response.json()) as { error?: string | { errors?: { reason?: string }[] } };
    reason =
      typeof body.error === 'string' ? body.error : (body.error?.errors?.[0]?.reason ?? reason);
  } catch {
    /* no provider response body in logs */
  }
  if (!/^[a-zA-Z0-9_]+$/.test(reason)) {
    reason = 'requestFailed';
  }
  const message =
    reason === 'invalid_grant'
      ? 'Free Hosting authorization expired or was revoked. Reconnect the central account in admin settings.'
      : `Hosting service: ${reason} (HTTP ${response.status}).`;
  if (response.status === 401) {
    clearTokenCache();
  }
  await db().videoHostingSettings.updateMany({
    where: { id: 'central' },
    data: { lastError: message },
  });
  throw new AppError(message, response.status === 401 ? 503 : 502);
}

export async function googleTokenRequest(
  params: Record<string, string>
): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await checked(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        ...params,
      }),
    })
  );
  return response.json();
}

let cached: { token: string; until: number; source: string } | undefined;
export function clearTokenCache(): void {
  cached = undefined;
}
export async function accessToken(): Promise<string> {
  const settings = await db().videoHostingSettings.findUnique({ where: { id: 'central' } });
  if (!settings?.encryptedRefreshToken) {
    throw new AppError('Free Hosting needs administrator authorization.', 503);
  }
  if (cached && cached.until > Date.now() && cached.source === settings.encryptedRefreshToken) {
    return cached.token;
  }
  const tokens = await googleTokenRequest({
    grant_type: 'refresh_token',
    refresh_token: decryptToken(settings.encryptedRefreshToken),
  });
  cached = {
    token: tokens.access_token,
    until: Date.now() + 45 * 60_000,
    source: settings.encryptedRefreshToken,
  };
  return tokens.access_token;
}

export async function youtube<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string
): Promise<T> {
  const response = await checked(
    await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
      method,
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token ?? (await accessToken())}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function verifyChannel(
  token?: string
): Promise<{ id: string; snippet: { title: string } }> {
  const result = await youtube<{ items: { id: string; snippet: { title: string } }[] }>(
    'channels?part=snippet&mine=true',
    'GET',
    undefined,
    token
  );
  const channel = result.items.find(item => item.id === config.YOUTUBE_CHANNEL_ID);
  if (!channel) {
    throw new AppError('The authorized account does not own the configured central channel.', 403);
  }
  return channel;
}

interface Video {
  id: string;
  snippet: { channelId: string; title: string };
  status: {
    uploadStatus: string;
    privacyStatus: string;
    embeddable: boolean;
    failureReason?: string;
    rejectionReason?: string;
  };
  processingDetails?: {
    processingStatus: string;
    processingProgress?: { partsTotal?: string | number; partsProcessed?: string | number };
  };
  contentDetails?: { duration: string };
}
export async function inspectVideo(id: string): Promise<Video> {
  const data = await youtube<{ items: Video[] }>(
    `videos?part=status,processingDetails,contentDetails,snippet&id=${encodeURIComponent(id)}`
  );
  const video = data.items[0];
  if (!video || video.snippet.channelId !== config.YOUTUBE_CHANNEL_ID) {
    throw new Error('Video not found in the central channel.');
  }
  return video;
}
export function durationSeconds(value = ''): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  return match
    ? Math.round(Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0))
    : 0;
}

export function sessionAddress(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.googleapis.com' ||
    !url.pathname.startsWith('/upload/youtube/')
  ) {
    throw new Error('Unexpected upload session host.');
  }
  return value;
}

// Persist the session before sending media. On retries, query the server offset;
// this also recovers the video ID when the final PUT response was lost.
export async function transfer(job: VideoUploadJob, filePath: string): Promise<void> {
  await verifyChannel();
  const fileSize = Number(job.fileSize);
  let session = job.sessionUrl;
  if (!session) {
    const response = await checked(
      await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Length': String(job.fileSize),
            'X-Upload-Content-Type': job.mimeType,
          },
          body: JSON.stringify({
            snippet: {
              title: job.title.slice(0, 100),
              description: job.description.slice(0, 5000),
              categoryId: '27',
            },
            status: { privacyStatus: 'unlisted', embeddable: true },
          }),
        }
      )
    );
    session = sessionAddress(response.headers.get('location') ?? '');
    await db().videoUploadJob.update({
      where: { id: job.id },
      data: { sessionUrl: session, status: 'UPLOADING', lastSyncedAt: new Date() },
    });
  }
  const headers = { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': job.mimeType };
  const probe = await fetch(sessionAddress(session), {
    method: 'PUT',
    headers: { ...headers, 'Content-Length': '0', 'Content-Range': `bytes */${job.fileSize}` },
    signal: AbortSignal.timeout(30_000),
  });
  // An expired session has an ambiguous outcome. Require manual reconciliation,
  // never automatically start another videos.insert and risk a duplicate video.
  if (probe.status === 404 || probe.status === 410) {
    throw new Error(
      'Upload session expired. Administrator reconciliation is required before creating a replacement job.'
    );
  }
  await checked(probe);
  const complete = async (response: Response): Promise<void> => {
    const data = (await response.json()) as { id: string };
    if (!data.id) {
      throw new Error('Upload did not return an asset identifier.');
    }
    await db().videoUploadJob.update({
      where: { id: job.id },
      data: {
        transferredBytes: BigInt(fileSize),
        lastSyncedAt: new Date(),
        externalVideoId: data.id,
        contentUrl: `https://www.youtube.com/watch?v=${data.id}`,
        status: 'PROCESSING',
        uploadError: null,
      },
    });
  };
  if (probe.status !== 308) {
    return complete(probe);
  }
  let offset = Number(probe.headers.get('range')?.match(/-(\d+)$/)?.[1] ?? -1) + 1;
  await db().videoUploadJob.update({
    where: { id: job.id },
    data: { status: 'UPLOADING', transferredBytes: BigInt(offset), lastSyncedAt: new Date() },
  });
  const file = await open(filePath, 'r');
  try {
    while (offset < fileSize) {
      const current = await db().videoUploadJob.findUniqueOrThrow({ where: { id: job.id } });
      if (current.status === 'CANCELLED') {
        return;
      }
      const buffer = Buffer.alloc(Math.min(8 * 1024 * 1024, fileSize - offset));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
      if (bytesRead !== buffer.length) {
        throw new Error('Temporary source file is incomplete.');
      }
      const response = await checked(
        await fetch(sessionAddress(session), {
          method: 'PUT',
          signal: AbortSignal.timeout(120_000),
          headers: {
            ...headers,
            'Content-Length': String(bytesRead),
            'Content-Range': `bytes ${offset}-${offset + bytesRead - 1}/${job.fileSize}`,
          },
          body: new Uint8Array(buffer),
        })
      );
      if (response.status !== 308) {
        return complete(response);
      }
      const next = Number(response.headers.get('range')?.match(/-(\d+)$/)?.[1] ?? -1) + 1;
      if (next <= offset) {
        throw new Error('Upload made no progress. Retry to resume.');
      }
      offset = next;
      await db().videoUploadJob.update({
        where: { id: job.id },
        data: { transferredBytes: BigInt(offset), lastSyncedAt: new Date() },
      });
    }
    throw new Error('Upload completion could not be confirmed. Retry to verify the session.');
  } finally {
    await file.close();
  }
}

interface PlaylistItem {
  id: string;
  snippet: { playlistId: string; position: number; resourceId: { kind: string; videoId: string } };
}
export async function syncPlaylist(courseId: string): Promise<void> {
  // A DB advisory lock serializes playlist creation across API/worker replicas.
  await db().$transaction(
    async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`playlist:${courseId}`}))`;
      const course = await tx.course.findUniqueOrThrow({
        where: { id: courseId },
        include: {
          modules: {
            where: { deletedAt: null },
            orderBy: { position: 'asc' },
            include: {
              lessons: {
                where: { videoProvider: 'YOUTUBE', deletedAt: null },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });
      const ids = [
        ...new Set(
          course.modules.flatMap(m =>
            m.lessons.map(l => l.externalVideoId).filter((id): id is string => Boolean(id))
          )
        ),
      ];
      if (!ids.length && !course.youtubePlaylistId) {
        return;
      }
      let playlistId = course.youtubePlaylistId;
      // Deterministic title lets retries recover a create response lost in transit.
      const title = `ALOSKILL course ${courseId}`;
      if (!playlistId) {
        let page = '';
        do {
          const existing = await youtube<{
            items: { id: string; snippet: { title: string } }[];
            nextPageToken?: string;
          }>(`playlists?part=snippet&mine=true&maxResults=50&pageToken=${page}`);
          playlistId = existing.items.find(p => p.snippet.title === title)?.id ?? null;
          page = existing.nextPageToken ?? '';
        } while (!playlistId && page);
        if (!playlistId) {
          playlistId = (
            await youtube<{ id: string }>('playlists?part=snippet,status', 'POST', {
              snippet: { title },
              status: { privacyStatus: 'private' },
            })
          ).id;
        }
        await tx.course.update({
          where: { id: courseId },
          data: { youtubePlaylistId: playlistId },
        });
      }
      const items: PlaylistItem[] = [];
      let page = '';
      do {
        const data = await youtube<{ items: PlaylistItem[]; nextPageToken?: string }>(
          `playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${page}`
        );
        items.push(...data.items);
        page = data.nextPageToken ?? '';
      } while (page);
      const seen = new Set<string>();
      for (const item of items) {
        const id = item.snippet.resourceId.videoId;
        if (!ids.includes(id) || seen.has(id)) {
          await youtube(`playlistItems?id=${item.id}`, 'DELETE');
        } else {
          seen.add(id);
        }
      }
      for (const [position, videoId] of ids.entries()) {
        const lesson = course.modules
          .flatMap(m => m.lessons)
          .find(l => l.externalVideoId === videoId);
        if (lesson) {
          await youtube('videos?part=snippet', 'PUT', {
            id: videoId,
            snippet: {
              title: lesson.title.slice(0, 100),
              description: (lesson.description ?? '').slice(0, 5000),
              categoryId: '27',
            },
          });
        }
        const existing = items.find(item => item.snippet.resourceId.videoId === videoId);
        const snippet = { playlistId, position, resourceId: { kind: 'youtube#video', videoId } };
        if (!existing) {
          await youtube('playlistItems?part=snippet', 'POST', { snippet });
        } else {
          await youtube('playlistItems?part=snippet', 'PUT', { id: existing.id, snippet });
        }
      }
      const syncedAt = new Date();
      await tx.course.update({
        where: { id: courseId },
        data: { playlistSyncError: null, playlistSyncedAt: syncedAt, updatedAt: syncedAt },
      });
    },
    { timeout: 120_000, maxWait: 5_000 }
  );
}
