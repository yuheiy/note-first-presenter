import { ofetch } from 'ofetch';

export const api = ofetch.create({
  retry: 0,
  responseType: 'json',
  ignoreResponseError: false,
});
