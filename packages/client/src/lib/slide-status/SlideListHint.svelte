<script lang="ts">
	interface Props {
		message: string;
	}

	const { message }: Props = $props();
</script>

<div role="status" aria-live="polite" class="hint">{message}</div>

<style>
	.hint {
		padding: 1rem;
		color: var(--color-muted);
		font-size: 0.9rem;
	}
</style>
