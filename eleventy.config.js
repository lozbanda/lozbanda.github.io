import { loadMusic } from './build/audio.mjs';

export default function (eleventyConfig) {
  // Git utilise une liste fermée avec négations ; Eleventy 3 ne les interprète
  // pas. Ses entrées restent explicitement limitées à src/ et contenu/.
  eleventyConfig.setUseGitIgnore(false);
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });
  eleventyConfig.addWatchTarget('./contenu/', { resetConfig: true });
  eleventyConfig.addWatchTarget('./build/');
  eleventyConfig.addWatchTarget('./src/assets/audio/', { resetConfig: true });
  eleventyConfig.setServerPassthroughCopyBehavior('copy');
  // Seules les pistes déclarées sont copiées ; pas de credits.json à maintenir.
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' }, { filter: ['**', '!audio', '!audio/**'] });
  for (const track of loadMusic().tracks) {
    eleventyConfig.addPassthroughCopy({ [`src/assets/audio/${track.file}`]: `assets/audio/${track.file}` });
  }
  eleventyConfig.setServerOptions({ module: 'lozbanda-local-server', port: 8013 });
  for (const path of ['vendor', 'styles.css', 'navigation.js', 'logo-egg.js', 'agenda.css', 'agenda.js',
    'agenda-data.js', 'agenda-carousel.js', 'music-player.js', 'music-player.css', 'gallery.js', 'gallery-data.js', 'content-data.js', '.nojekyll']) {
    eleventyConfig.addPassthroughCopy({ [`src/${path}`]: path });
  }
  // Les pages restent à la racine de l’artefact. Tous leurs liens sont
  // relatifs : / comme /nom-du-depot/ fonctionnent sans connaître le dépôt.
  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: 'site' },
    templateFormats: ['njk', '11ty.js'],
    htmlTemplateEngine: 'njk',
  };
}
