export default class {
  data() { return { permalink: 'sorties.json', eleventyExcludeFromCollections: true }; }
  render(data) { return JSON.stringify(data.contenus.photos, null, 2) + '\n'; }
}
