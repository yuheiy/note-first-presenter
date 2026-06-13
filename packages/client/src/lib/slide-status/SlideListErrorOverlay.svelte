<script lang="ts">
	interface Props {
		message: string;
	}

	const { message }: Props = $props();
</script>

<div
	role="alert"
	aria-live="assertive"
	class="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] p-4 text-center"
>
	<p>{message}</p>
</div>
