<script lang="ts">
	interface Props {
		message: string;
	}

	const { message }: Props = $props();
</script>

<div role="status" aria-live="polite" class="p-4 text-[0.9rem] text-gray-500">{message}</div>
