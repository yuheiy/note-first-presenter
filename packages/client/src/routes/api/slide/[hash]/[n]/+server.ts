import { error } from '@sveltejs/kit';
import runtimeConfig from 'virtual:nfp/runtime-config';
import { ensurePdfState, getSlideImage, PageOutOfRangeError } from '$lib/server/pdf-renderer';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
  const status = runtimeConfig.slidesStatus;
  if (status.kind !== 'resolved') {
    error(404, 'slides not available');
  }
  ensurePdfState({ slidesPath: status.path, cacheRoot: runtimeConfig.cacheRoot });

  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) {
    error(400, 'invalid page');
  }

  try {
    const { data, hash } = await getSlideImage(n);
    if (params.hash !== hash) {
      error(404, 'hash mismatch');
    }
    setHeaders({
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${hash}-${n}"`,
    });
    return new Response(new Uint8Array(data));
  } catch (err) {
    if (err instanceof PageOutOfRangeError) {
      error(404, 'out of range');
    }
    throw err;
  }
};
