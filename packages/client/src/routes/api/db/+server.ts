export const prerender = false;

import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import runtimeConfig from 'virtual:nfp/runtime-config';
import { dbSchema } from '$lib/db/schema';
import { readDb, writeDb } from '$lib/server/db-io';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const db = await readDb(runtimeConfig.dbPath);
  return json(db);
};

export const PUT: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'invalid JSON');
  }
  const result = v.safeParse(dbSchema, body);
  if (!result.success) {
    error(400, 'invalid body');
  }
  await writeDb(runtimeConfig.dbPath, result.output);
  return new Response(null, { status: 204 });
};
