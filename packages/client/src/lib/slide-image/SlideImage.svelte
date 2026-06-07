<script lang="ts">
    import { slideUrl } from "#lib/runtime-mode";

    interface Props {
        hash: string;
        slide: number;
        alt?: string;
    }

    const { hash, slide, alt = "" }: Props = $props();
    const src = $derived(slideUrl(hash, slide));
</script>

<img {src} {alt} loading="lazy" />

<style>
    img {
        width: 100%;
        height: 100%;
        vertical-align: middle;
        object-fit: contain;
    }
</style>
