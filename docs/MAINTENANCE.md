# Mode maintenance

La page `maintenance/index.html` est la page d’attente précédemment publiée,
avec seulement son titre, sa description et son message adaptés :

> **Maintenance en cours.**
>
> Le site revient bientôt. Un peu de patience !

Le logo, les couleurs, l’espacement, le contact et la mise en page sont conservés.
Le style est dans `maintenance/maintenance.css`. Aucun script ni audio.

## Depuis GitHub, sans installer quoi que ce soit

1. Ouvrir [Actions → Publier le site ou la maintenance](https://github.com/lozbanda/lozbanda.github.io/actions/workflows/pages.yml).
2. Cliquer **Run workflow**, sélectionner **main**.
3. Choisir le mode **maintenance** et confirmer **Run workflow**.
4. Attendre que les jobs **build** puis **deploy** soient verts.
5. Ouvrir https://lozbanda.github.io/ et une page directe, par exemple
   https://lozbanda.github.io/agenda.html.

Pour rouvrir le site : mêmes étapes avec le mode **site**. Le workflow régénère
la version actuelle de `main`, teste les fichiers et refuse les contenus fictifs.
Un échec ne remplace pas le dernier déploiement réussi.

**Un commit Markdown ne désactive pas la maintenance.** La CI reconstruit seulement
un artefact de contrôle ; la publication attend toujours une décision manuelle.
Ne pas lancer des bascules opposées simultanément : attendre le déploiement courant.
Le mode et le commit sont visibles dans le nom et le détail du run Pages.

## Ce qui est réellement remplacé

- Accueil et quatre pages secondaires : maintenance, y compris les accès directs.
- Autres adresses : page `404.html` de maintenance, avec ressources à la racine
  pour les chemins imbriqués. Cette page cible le site utilisateur à la racine
  `lozbanda.github.io`, pas un futur sous-dossier sans adaptation.
- Anciennes sorties JSON, scripts du site, calendrier et MP3 : absents du nouvel
  artefact, pas simplement cachés par une bannière ou une redirection JavaScript.
- Fichiers publiés : cinq pages HTML, une 404, un CSS, logo, favicon et `.nojekyll`.

Le générateur `scripts/build-maintenance.mjs` n’a aucune dépendance npm et n’importe
pas Eleventy ou le contenu éditorial. Il reste utilisable si un Markdown est invalide.
Il remplace la sortie atomiquement après copie et refuse les liens symboliques.

## Limites importantes

GitHub Pages sert des fichiers statiques : les pages existantes répondent **200**,
les adresses inconnues **404**. Le message n’est pas une vraie réponse HTTP 503
avec `Retry-After`. Pas de mot de passe, de révocation d’accès, ni de protection
du dépôt public. Les anciennes copies déjà téléchargées, les caches et l’historique
Git peuvent conserver des contenus. Une page déjà ouverte n’est pas fermée à distance.
La bascule devient visible après le déploiement et la propagation des caches.

Le mode maintenance n’est donc pas un moyen de retirer un secret ou de rendre privé
un contenu publié par erreur. Pour cela, traiter séparément les copies, l’historique
et les éventuels accès exposés.

## Essai local

Depuis le dépôt :

```bash
node --test tests/maintenance.test.mjs
node scripts/build-maintenance.mjs
python3 -m http.server 8015 --bind 127.0.0.1 --directory site
```

Arrêter ce serveur d’essai avec Ctrl+C. Puis `npm ci --ignore-scripts` si nécessaire,
et `npm run build` pour revenir au site complet local. Ces commandes ne publient rien.

## Références

- [Inputs d’un workflow manuel](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs)
- [Workflow personnalisé Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Page 404 personnalisée](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)

[Retour au guide](../README.md) · [Modifier les Markdown](EDITION.md)
