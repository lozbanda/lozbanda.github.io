# Loz’Banda

**[Voir le site](https://lozbanda.github.io/)** · Site statique Eleventy, éditable en Markdown.
Ce dépôt est la source commune du site local et de GitHub. **Ne jamais modifier `site/`**, qui est généré.

## 1. Modifier

Sur GitHub : ouvrir un fichier ci-dessous, cliquer sur le crayon et enregistrer, de préférence via une pull request.
En local : commencer avec un arbre propre (`git status`), puis `git pull --ff-only` avant de travailler.

| À modifier | Source |
|---|---|
| Dates et archives | [`contenu/agenda.md`](contenu/agenda.md) |
| Photos, ordre et descriptions | [`contenu/galerie.md`](contenu/galerie.md) |
| Musiciens et récits | [`contenu/musiciens.md`](contenu/musiciens.md) |
| Informations pratiques | [`contenu/infos-pratiques.md`](contenu/infos-pratiques.md) |
| Musique et crédits | [`contenu/musique.md`](contenu/musique.md) |
| Accueil et présentation | `src/index.njk`, `src/styles.css`, `src/_includes/` |

Un bloc `##` crée une entrée. [Champs, images et exemples détaillés](docs/EDITION.md).

## 2. Tester et envoyer les changements locaux

Avec **Node 26.8.2** (`.node-version`) et npm, depuis la racine du dépôt :

```bash
npm ci --ignore-scripts       # première installation ou dépendances modifiées
npm run dev                  # aperçu : http://127.0.0.1:8013/ ; Ctrl+C pour arrêter
npm test                     # reconstruit le site et exécute les tests
npm run check:publication     # contrôle le contenu destiné au public
git diff                     # relire les changements
# Adapter cette liste aux fichiers réellement modifiés :
git add contenu/infos-pratiques.md
git commit -m "Mettre à jour le site"
git push origin main
```

Si Git signale une divergence, résoudre les différences : **ne pas forcer le push**.
Un changement fait sur GitHub se récupère avec `git pull --ff-only`, sans écraser des modifications locales.

## 3. Publier ou activer la maintenance

Chaque push/PR lance la **CI : Vérifier et régénérer le site**. Attendre son succès.
L’artefact `site-verifie` permet de consulter le résultat ; **un push ne publie pas**.

Dans [Actions → Publier le site ou la maintenance](https://github.com/lozbanda/lozbanda.github.io/actions/workflows/pages.yml) :
**Run workflow → branche `main` → mode `site` → Run workflow**. Attendre la fin du déploiement.

Pour mettre en maintenance, choisir **`maintenance`** ; pour revenir, choisir **`site`**.
La maintenance ne rend pas le dépôt privé. [Détails et retour arrière](docs/MAINTENANCE.md).

## Ce qui reste hors GitHub

`site/`, `node_modules/`, originaux privés, sauvegardes, brouillons et propositions alternatives ne sont pas versionnés.
La liste fermée de `.gitignore` protège ce périmètre : **pas de `git add -f`**.
Pour un nouveau média, confirmer les droits, l’optimiser dans `src/assets/`, autoriser son chemin exact dans `.gitignore`
et envoyer le média avec son Markdown. Conserver les crédits et les mentions des six profils fictifs convenus ;
les fausses dates et les autres fiches fictives restent bloquées. [Guide d’édition](docs/EDITION.md).
