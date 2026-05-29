import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';

const isStatic = process.env.NFP_STATIC === '1';
const outDir = process.env.NFP_OUT_DIR || 'build';

const config = {
  kit: {
    adapter: isStatic
      ? adapterStatic({
          pages: outDir,
          assets: outDir,
          fallback: undefined,
          precompress: false,
          strict: false,
        })
      : adapterAuto(),
  },
};

export default config;
