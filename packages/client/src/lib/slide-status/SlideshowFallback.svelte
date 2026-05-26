<script lang="ts">
	interface Props {
		message: string;
	}

	const { message }: Props = $props();
</script>

<p>{message}</p>

<style>
	p {
		color: #fff;
		font-size: 1.25rem;
		text-align: center;
		padding: 2rem;
	}
</style>
