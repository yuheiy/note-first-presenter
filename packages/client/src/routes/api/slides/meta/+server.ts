export const prerender = false;

import { json } from '@sveltejs/kit';
import runtimeConfig from 'virtual:nfp/runtime-config';
import { ensurePdfState, getSlidesMeta } from '$lib/server/pdf-renderer';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const status = runtimeConfig.slidesStatus;
  if (status.kind !== 'resolved') {
    return json(status, { status: 422 });
  }
  ensurePdfState({ slidesPath: status.path, cacheRoot: runtimeConfig.cacheRoot });
  const meta = await getSlidesMeta();
  return json({ status: 'resolved', ...meta });
};
