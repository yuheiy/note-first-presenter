<script lang="ts">
	interface Props {
		message: string;
	}

	const { message }: Props = $props();
</script>

<div role="alert" aria-live="assertive" class="overlay">
	<p>{message}</p>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		background: color-mix(in srgb, var(--color-bg) 85%, transparent);
		display: grid;
		place-items: center;
		padding: 1rem;
		text-align: center;
	}
</style>
