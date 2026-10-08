import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default {
  base: '/aakash-profile/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        sakhaon: resolve(root, 'sakhaon/index.html'),
      },
    },
  },
};
