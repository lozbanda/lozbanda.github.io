export default class {
  data() { return { permalink: 'evenements.json', eleventyExcludeFromCollections: true }; }
  render(data) { return JSON.stringify(data.contenus.events, null, 2) + '\n'; }
}
