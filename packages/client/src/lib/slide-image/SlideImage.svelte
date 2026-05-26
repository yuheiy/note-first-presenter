<script lang="ts">
	interface Props {
		hash: string;
		slide: number;
		alt?: string;
	}

	const { hash, slide, alt = '' }: Props = $props();
</script>

<img src={`/api/slide/${hash}/${slide}`} {alt} loading="lazy" />

<style>
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
