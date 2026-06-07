<script lang="ts">
    interface Props {
        message: string;
    }

    const { message }: Props = $props();
</script>

<div class="fallback">
    {message}
</div>

<style>
    .fallback {
        box-sizing: border-box;
        display: grid;
        place-items: center;
        height: 100%;
        padding: 2rem;
        font-family: sans-serif;
        font-size: 1.25rem;
        text-align: center;
        color: white;
    }
</style>
