// Adaptateur de @11ty/eleventy-dev-server 2.0.8 : sa configuration standard
// ne transmet pas « host » à listen(). Ne jamais exposer l’aperçu au réseau.
const DevServer = require('@11ty/eleventy-dev-server');
class LocalServer extends DevServer {
  _serverListen(port) {
    this.server.listen({ port, host: '127.0.0.1' });
  }
}
// Export nommé explicite : import() sur CommonJS expose aussi « module.exports »
// avec Node récent ; Eleventy doit voir getServer directement dans le namespace.
exports.getServer = (...args) => new LocalServer(...args);
