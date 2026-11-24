import { extendTailwindMerge } from 'tailwind-merge';

export const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['micro', 'tiny', 'detail', 'body', 'heading', 'title'],
      radius: ['field', 'selector', 'box'],
    },
  },
});
