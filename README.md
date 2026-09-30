# Loz’Banda — site et mode maintenance

**Site : https://lozbanda.github.io/**

**Dépôt : https://github.com/lozbanda/lozbanda.github.io**

Site statique français, généré par Eleventy à partir de cinq fichiers Markdown.
Logo authentique, calendrier local, galerie progressive, musiciens, informations
pratiques et deux morceaux locaux autorisés. Aucun CMS, police distante ou traqueur.

## Modifier le contenu directement sur GitHub

1. Ouvrir un fichier dans [`contenu/`](contenu/), puis cliquer sur le crayon.
2. Modifier et enregistrer le Markdown, de préférence via une branche et une PR.
3. Attendre **Actions → Vérifier et régénérer le site** : GitHub installe les
   dépendances verrouillées, régénère le site et exécute les tests.
4. Le résultat `site-verifie` est téléchargeable dans les artefacts du run pendant
   un jour (archive contenant `artifact.tar`). **Ce résultat n’est pas mis en ligne.**
5. Pour publier : **Actions → Publier le site ou la maintenance → Run workflow →
   branche `main` → mode `site` → Run workflow**.

[Guide d’édition des cinq Markdown](docs/EDITION.md).
Ne jamais modifier le dossier généré `site/` : il n’est pas versionné.

## Activer / désactiver la maintenance

Dans le même workflow **Publier le site ou la maintenance**, choisir :

| Mode | Effet après déploiement réussi |
|---|---|
| `maintenance` | Remplace toutes les pages par l’ancienne page d’attente, adaptée en « Maintenance en cours ». |
| `site` | Régénère, teste et remet le site complet en ligne. |

Aucun fichier de configuration à éditer, aucun secret à fournir.
Le choix n’est pas un changement de source ni un interrupteur instantané :
il faut attendre la fin du workflow. Un push laisse le mode actuellement publié
inchangé. Le mode maintenance fonctionne sans installer npm et sans analyser les
Markdown. Il ne masque pas les fichiers déjà présents dans ce dépôt public.

[Mode maintenance, limites et retour arrière](docs/MAINTENANCE.md).

## Première version et contenus à compléter

- Neuf dates d’archives sourcées ; aucune prestation future inventée.
- Les exemples d’agenda et fiches Lorem ipsum de la maquette ne sont pas importés.
- La galerie et les portraits attendent des contenus validés. **Les photos de
  la maquette ne sont ni dans ce dépôt ni dans l’artefact.** Confirmer les droits
  de reproduction et le droit à l’image avant de les ajouter.
- Les deux enregistrements actuels ont fait l’objet d’une confirmation des droits
  de téléchargement/rediffusion le 29 septembre 2026 ; crédits dans
  [`contenu/musique.md`](contenu/musique.md). Aucune licence libre revendiquée.
- Le réglage `noindex, nofollow` reste provisoire. Ce n’est pas une protection
  d’accès. Identité du responsable et mentions légales restent à compléter avec
  la banda avant la diffusion officielle ; aucun nom ni adresse ne sont inventés.
- `npm run check:publication` refuse les événements et musiciens encore marqués
  `Exemple : oui`. Il ne certifie pas les droits ou l’exactitude des informations.

## Développer et vérifier en local

Node **26.8.2**, indiqué dans `.node-version` ; npm fourni avec Node.

```bash
npm ci --ignore-scripts
npm test
npm run check:publication
npm run dev                  # http://127.0.0.1:8013/ ; boucle locale seulement
```

```bash
npm run build                # site complet dans site/, sans publication
npm run test:maintenance     # contrôle autonome, même sans node_modules/
npm run build:maintenance    # remplace la sortie locale par la maintenance
npm run build                # rétablit la sortie locale complète
```

Les builds préparent une sortie temporaire puis remplacent `site/` seulement
après succès. `build/` contient du **code source**, pas des fichiers générés.
Les tests de provenance nécessitant les archives privées sont ignorés en CI ;
les validations portables et les tests de génération restent exécutés.
Les tests navigateur et auditifs ne sont pas annoncés comme exécutés par cette CI.

## Publication et sécurité

- CI automatique : `push`, `pull_request`, déclenchement manuel ; `contents: read`.
- Publication : uniquement `workflow_dispatch`, depuis `main`, tests et contrôle
  éditorial pour `site`, contrôles autonomes pour `maintenance`.
- Seul le job de déploiement a `pages: write` et `id-token: write`.
- Actions officielles épinglées par SHA, dépendances npm verrouillées.
- Seul `site/` est envoyé à Pages. Les sources du dépôt restent néanmoins publiques.
- `.gitignore` autorise explicitement les sources et les médias actuels : vérifier
  les fichiers suivis avant chaque ajout. Ne pas utiliser `git add -f` pour passer
  outre ; ajouter le chemin d’un nouveau média uniquement après validation.
- Aucun mot de passe ni jeton personnel dans le dépôt ou les workflows.

L’historique conserve la première page d’attente et le renommage du dépôt.
Pour corriger une publication, utiliser un nouveau commit ou `git revert`, puis
un déploiement manuel ; ne pas supprimer le dépôt ni réécrire son historique.
