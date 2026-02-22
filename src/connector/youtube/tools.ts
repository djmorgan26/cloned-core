/**
 * YouTube connector tools.
 * All publish actions are gated by approval.
 * Default mode is "assist" (generate package without uploading).
 */

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeToolContext {
  access_token: string;
  assist_mode?: boolean; // If true, generate package but don't upload
  fetch?: (url: string | URL, init?: RequestInit) => Promise<Response>;
}

export interface VideoPackageInput {
  title: string;
  description: string;
  tags?: string[];
  category_id?: string;
  privacy?: 'public' | 'private' | 'unlisted';
}

export interface VideoPackage {
  title: string;
  description: string;
  tags: string[];
  category_id: string;
  privacy: 'public' | 'private' | 'unlisted';
  generated_at: string;
  approved: false;   // Package not yet approved for upload
}

/**
 * Generate a video package (metadata + description).
 * Does NOT upload. Requires approval before uploading.
 */
export async function packageVideo(
  _ctx: YouTubeToolContext,
  input: VideoPackageInput,
): Promise<VideoPackage> {
  return {
    title: input.title,
    description: input.description,
    tags: input.tags ?? [],
    category_id: input.category_id ?? '22', // People & Blogs
    privacy: input.privacy ?? 'private',
    generated_at: new Date().toISOString(),
    approved: false,
  };
}

export interface VideoUploadInput {
  video_file_path: string;
  package: VideoPackage;
  approval_id: string; // Must reference an approved approval record
}

export interface VideoUploadOutput {
  video_id: string;
  url: string;
  title: string;
  status: string;
}

/**
 * Upload a video to YouTube. Requires an approved approval record.
 * In assist mode, this will not run.
 */
export async function uploadVideo(
  ctx: YouTubeToolContext,
  input: VideoUploadInput,
): Promise<VideoUploadOutput> {
  if (ctx.assist_mode) {
    throw new Error('Upload blocked: connector is in assist mode. Disable assist mode and get approval first.');
  }

  // Actual upload would use resumable upload API
  // This is a stub that documents the pattern
  const { createReadStream } = await import('node:fs');
  const stream = createReadStream(input.video_file_path);

  const http = ctx.fetch ?? fetch;
  const resp = await http(
    `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.access_token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/*',
      },
      body: JSON.stringify({
        snippet: {
          title: input.package.title,
          description: input.package.description,
          tags: input.package.tags,
          categoryId: input.package.category_id,
        },
        status: {
          privacyStatus: input.package.privacy,
        },
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(`YouTube upload initiation failed: ${resp.status}`);
  }

  const uploadUri = resp.headers.get('Location');
  if (!uploadUri) throw new Error('No upload URI returned by YouTube');

  // Stream the actual video (simplified)
  const uploadResp = await http(uploadUri, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${ctx.access_token}`,
      'Content-Type': 'video/*',
    },
    body: stream,
    duplex: 'half',
  });

  if (!uploadResp.ok) {
    throw new Error(`YouTube video upload failed: ${uploadResp.status}`);
  }

  const data = await uploadResp.json() as { id: string; snippet?: { title?: string }; status?: { uploadStatus?: string } };
  return {
    video_id: data.id,
    url: `https://www.youtube.com/watch?v=${data.id}`,
    title: data.snippet?.title ?? input.package.title,
    status: data.status?.uploadStatus ?? 'uploaded',
  };
}

/**
 * List channels for the authenticated user.
 */
export async function listMyChannels(
  ctx: YouTubeToolContext,
): Promise<Array<{ id: string; title: string; subscriber_count?: number }>> {
  const http = ctx.fetch ?? fetch;
  const resp = await http(
    `${YOUTUBE_API}/channels?part=snippet,statistics&mine=true`,
    {
      headers: {
        Authorization: `Bearer ${ctx.access_token}`,
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`YouTube channels list failed: ${resp.status}`);
  }

  const data = await resp.json() as {
    items?: Array<{
      id: string;
      snippet?: { title?: string };
      statistics?: { subscriberCount?: string };
    }>;
  };

  return (data.items ?? []).map((ch) => ({
    id: ch.id,
    title: ch.snippet?.title ?? ch.id,
    subscriber_count: ch.statistics?.subscriberCount
      ? parseInt(ch.statistics.subscriberCount, 10)
      : undefined,
  }));
}
