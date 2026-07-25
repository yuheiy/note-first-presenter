<script lang="ts">
    import { slideImageUrl } from "$lib/slide-filename";

    interface Props {
        hash: string;
        slide: number;
        alt?: string;
    }

    const { hash, slide, alt = "" }: Props = $props();
    const src = $derived(slideImageUrl(hash, slide));
</script>

<img {src} {alt} loading="lazy" class="h-full w-full object-contain" />
