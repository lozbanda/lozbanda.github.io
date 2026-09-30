# Loz’Banda — Le site arrive bientôt

Première version du site : **une page d’attente en français**, le logo authentique
et le contact de la banda. Aucun calendrier fictif, galerie, audio, traceur ou
script visiteur. Le site complet est préparé séparément et n’est pas dans ce dépôt.

URL prévue après publication : **https://lozbanda.github.io/lozbanda/**.

## Modifier la page

- Texte et contact : `src/index.html`.
- Couleurs et disposition : `src/styles.css`.
- Logo et favicon : `src/assets/`.

Sur GitHub, utiliser le bouton crayon, enregistrer sur une branche ou dans une
pull request, puis attendre le workflow **Vérifier la page d’attente**.
La CI vérifie aussi chaque push. Un succès ne publie rien automatiquement.

## Publier volontairement

1. Dans **Settings → Pages → Build and deployment**, choisir **GitHub Actions**.
2. Dans **Actions → Publier la page d’attente → Run workflow**, sélectionner `main`.
3. Attendre les jobs `build` et `deploy`, puis ouvrir l’URL donnée par le déploiement.

Le workflow manuel refait les tests avant de publier **seulement `site/`**.
Il utilise le jeton natif GitHub Actions : aucun mot de passe ou jeton personnel
à ajouter aux fichiers ou aux secrets du dépôt. Les actions officielles sont
épinglées par SHA, vérifiées le 30 septembre 2026.

## Vérifier localement

Node est indiqué dans `.node-version` (26.8.2). Aucune dépendance npm externe.

```bash
npm ci --ignore-scripts
npm test
python3 -m http.server 8015 --bind 127.0.0.1 --directory site
```

Puis ouvrir http://127.0.0.1:8015/. Avec mise, préfixer les commandes npm par
`mise exec node@26.8.2 --` si Node n’est pas déjà sélectionné.

`src/` est la source ; **ne jamais éditer `site/`**, qui est reconstruit.
Le build ne copie que les quatre ressources prévues et crée `.nojekyll`.
Une source absente ne détruit pas la dernière génération réussie.

## Périmètre et sécurité

`.gitignore` fonctionne comme une **liste fermée** : seuls les fichiers de cette
première version peuvent être ajoutés normalement. Toute extension du périmètre
doit être délibérée. Ne pas utiliser `git add -f` pour ajouter des fichiers privés.
Un dépôt public expose ses sources et son historique, pas seulement le site affiché.

Le logo est le dérivé proportionnel du dessin fourni pour Loz’Banda, sans
recoloration ni invention de traits. Source de référence :
[fiche municipale du Chastel-Nouvel](https://www.chastel-nouvel.fr/store/lozbanda/).
Aucune licence ouverte n’est attribuée à l’illustration.

La page ne promet pas de date d’ouverture. `noindex, nofollow` est provisoire,
mais ne protège pas l’accès : cette page et ce dépôt sont destinés à être publics.

## Passage au site complet

Importer les sources Eleventy, Markdown et médias validés dans **une branche**,
adapter la liste Git et remplacer les workflows de cette première version par
ceux du site complet. Les trois exemples fictifs devront être supprimés ou
remplacés par des dates confirmées. Vérifier les droits des photos et les mentions
légales ; maintenir une publication manuelle après CI. Ne pas copier le dossier
de travail privé ni simplement désactiver les garde-fous.
