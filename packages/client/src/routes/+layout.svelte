<script lang="ts">
  import { getLocale, getTextDirection } from '$lib/paraglide/runtime';

  let { children } = $props();

  document.documentElement.lang = getLocale();
  document.documentElement.dir = getTextDirection();
</script>

{@render children()}
