<script lang="ts">
    import { slideUrl } from "$lib/runtime-mode";

    interface Props {
        hash: string;
        slide: number;
        alt?: string;
    }

    const { hash, slide, alt = "" }: Props = $props();
    const src = $derived(slideUrl(hash, slide));
</script>

<img {src} {alt} loading="lazy" class="h-full w-full object-contain" />
