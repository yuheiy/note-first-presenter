<script lang="ts">
	import Editor from '$lib/workspace/Editor.svelte';
	import Viewer from '$lib/workspace/Viewer.svelte';
</script>

{#if import.meta.env.DEV}
	<Editor />
{:else}
	<Viewer />
{/if}
