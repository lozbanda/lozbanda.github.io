# Modifier le site en Markdown

Les sources sont dans [`contenu/`](../contenu/), accessibles avec le crayon GitHub.
Un fichier enregistré déclenche **Vérifier et régénérer le site**. La génération se
fait sur GitHub, pas sur l’ordinateur qui a effectué l’édition.

| Fichier | Ce qu’il pilote |
|---|---|
| [`agenda.md`](../contenu/agenda.md) | Dates, archives, cartes et calendrier |
| [`galerie.md`](../contenu/galerie.md) | Ordre, légendes, alternatives et photos |
| [`musiciens.md`](../contenu/musiciens.md) | Noms, instruments, récits et portraits facultatifs |
| [`infos-pratiques.md`](../contenu/infos-pratiques.md) | Cartes et liens de contact |
| [`musique.md`](../contenu/musique.md) | Morceaux locaux, ordre et crédits |

Le titre `#` et le préambule sont des consignes non affichées. Chaque bloc `##`
crée une entrée. Les champs précèdent la description, dans une liste `- Champ : valeur`.
Les erreurs mentionnent le fichier, la ligne et l’entrée ; ne pas modifier les tests
pour faire accepter une date ou un fichier invalide.

## Agenda

Champs : `Identifiant`, `Date` (AAAA-MM-JJ), `Dernier jour` pour une période inclusive,
`Début` et `Fin` (HH:MM), `Lieu`, `Source` (lien Markdown HTTPS), `Exemple`.
Seule la date est obligatoire. Conserver les identifiants au réordonnancement.
Ne pas inventer d’horaires et ne pas confondre date de publication et date d’événement.

`Exemple : oui` signale un brouillon fictif : le workflow de publication le refuse.
Remplacer tout le bloc par une annonce confirmée, ou retirer le bloc ; ne pas
seulement effacer le marqueur pour rendre un faux rendez-vous publiable.

## Galerie et portraits

Les 24 photos et leurs descriptions de la version locale ont été reprises à la
demande explicite de publication le 30 septembre 2026. Une galerie peut
aussi être vide : un message l’indique alors. Les originaux privés restent exclus.

Pour une nouvelle photo, après confirmation des droits du photographe et du droit à l’image :

1. Optimiser l’image, retirer ses métadonnées privées et rester sous 1 Mo.
2. Ajouter uniquement ce média à `src/assets/` (portrait : `src/assets/musiciens/`).
3. Autoriser explicitement son chemin dans `.gitignore` ; contrôler le diff.
4. Ajouter le bloc Markdown avec un titre `##` et `- Image : assets/nom.webp`.
   `Alternative` décrit sobrement l’image ; `Source` conserve la provenance dans
   les sources. `Miniature` et `Variantes` sont facultatifs. Les largeurs du `srcset`
   doivent être les dimensions réelles des fichiers.
5. Vérifier la CI avant de lancer une publication volontaire.

Un musicien utilise un titre `##` pour son nom validé, `- Instrument : …`, puis
un paragraphe expliquant son choix. Portrait facultatif : `- Photo : assets/musiciens/prenom.webp`,
et éventuellement `- Alternative : Portrait de Prénom`. Sans photo, un emplacement
neutre s’affiche ; sans fiche, la page annonce les portraits à venir.
Ne jamais publier une identité fictive comme si elle appartenait au groupe.

Les six profils nommés actuellement affichés sont expressément demandés comme
**portraits fictifs**. Conserver `- Exemple : oui` : cela affiche la mention près
de chaque nom. Le contrôle de publication n’autorise que ces six noms, définis dans
`scripts/check-content.mjs`, et refuse qu’ils perdent leur marqueur. Une nouvelle
fiche fictive reste bloquée sans décision éditoriale explicite. Pour passer à de
vraies présentations validées, remplacer les blocs et ajuster cette liste d’exception
si nécessaire, sans présenter les récits inventés comme des biographies réelles.

## Informations pratiques

Un `##` par carte. Le texte accepte paragraphes, emphase, listes et liens sûrs.
Un bouton facultatif se place immédiatement sous le titre :

```markdown
- Bouton : [Contacter la banda](mailto:lozbanda48@hotmail.com)
```

Ne pas inventer le financement, les horaires de répétition ou les responsables.

## Musique

Un `##` par morceau, dans l’ordre voulu. `Fichier` est obligatoire et désigne un
MP3/WAV directement dans `assets/audio/`. `Crédit`, `Source`, `Licence` et `Empreinte`
sont facultatifs selon les preuves disponibles ; ne pas inventer de licence.
La source vidéo est une provenance, jamais une URL de lecture distante.
Les fichiers non déclarés ne sont pas copiés dans l’artefact.

Conserver les crédits et l’empreinte de l’enregistrement actuel, « La Lozère bat des ailes ».
Une nouvelle piste exige sa propre autorisation ; l’accord existant ne la couvre pas.
Le lecteur est masqué au départ : le bouton CD, intégré à droite du menu,
l’affiche sous la barre de navigation, sans démarrer la musique.
Seul **Lire** lance le morceau, sans avance automatique. Le CD peut masquer à nouveau
le lecteur sans interrompre la musique, qui continue entre les pages internes.
Échap referme d’abord les crédits ouverts, puis le lecteur en rendant le focus au CD.
Sans JavaScript, le même bouton donne accès au lecteur natif et aux crédits.
Une recharge complète, une fermeture de l’onglet ou le départ du site arrête la musique.

## Vérifier puis mettre en ligne

- Attendre la CI verte. L’artefact `site-verifie` contient le site régénéré,
  disponible un jour. Les tests vérifient notamment que des changements Markdown
  seuls se retrouvent dans le HTML et le JSON, et qu’un échec conserve la sortie précédente.
- Fusionner sur `main` après relecture ; vérifier la CI de cette révision.
- **Actions → Publier le site ou la maintenance → Run workflow → main → site**.
- Si le mode maintenance est actif, le push et la CI le laissent actif.
- Sans publication réussie, le site en ligne ne change pas.

Un fichier de sortie n’est jamais la source de vérité : ne pas éditer `site/`.
Les nouveaux médias et leur Markdown doivent être ajoutés dans le même commit ou
la même PR pour éviter une référence à un fichier encore absent.

[Accueil du dépôt](../README.md) · [Maintenance](MAINTENANCE.md)
