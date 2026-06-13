<script lang="ts">
    interface Props {
        message: string;
    }

    const { message }: Props = $props();
</script>

<div
    class="grid h-full place-items-center p-8 text-center font-sans text-[1.25rem] text-white"
>
    {message}
</div>
