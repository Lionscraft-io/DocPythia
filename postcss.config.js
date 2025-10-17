import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config.ts';

export default {
  plugins: [
    tailwindcss(tailwindConfig),
    autoprefixer,
  ],
}
