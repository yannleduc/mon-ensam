# Mon ENSAM

Appli personnelle de cours et de révisions, aux couleurs d'Arts et Métiers (violet `#80276C`, jaune `#FFA300`).
Elle tourne dans Safari sur Mac et iPad, s'installe comme une vraie appli et ne coûte rien.

- **Cours** : dépose tes PDF (ou PowerPoint, Word, images), rangés par matière, avec visionneuse intégrée.
- **Fiches automatiques** : Claude écrit pour chaque cours une fiche de révision (formules en LaTeX), un résumé,
  un lexique, un formulaire, un quiz et des flashcards.
- **Révisions** : quiz sur un ou plusieurs cours (priorité à tes erreurs), flashcards en répétition espacée,
  quiz inédits sur demande, suivi de ta réussite par matière.
- **Emploi du temps** : ton lien ICS, mis à jour toutes les 2 h, vue semaine ou liste, lisible hors-ligne.
- **Agenda** : contrôles, rendus, oraux avec compte à rebours ; les évaluations de l'EDT et les dates trouvées
  dans tes cours y remontent toutes seules ; export vers Calendrier.
- **Demander à Claude** : sur chaque cours, une question tout de suite dans Claude, ou une réponse rangée dans l'appli.

## Comment ça marche

```
 Mac / iPad ──(appli web, GitHub Pages)──►  dépôt privé « ensam-data »  ◄── tâche planifiée Claude (ton abonnement)
                                                    ▲
                                                    └── GitHub Actions : télécharge l'emploi du temps (gratuit)
```

Pas de serveur ni de clé API payante : l'appli lit et écrit dans ton dépôt privé, et une tâche planifiée
Claude passe régulièrement pour traiter ce qui est « en attente ».

## Installation (une seule fois, ~10 minutes)

1. **Dépôt de l'appli** : crée un dépôt `mon-ensam` sur GitHub et mets-y le contenu de ce dossier.
   *Settings → Pages → Deploy from a branch → `main` / `(root)`*. L'appli sera sur
   `https://<ton-pseudo>.github.io/mon-ensam/`.
2. **Dépôt des données** : crée un second dépôt **privé** `ensam-data`, vide.
3. **Jeton** : *Settings (ton profil) → Developer settings → Personal access tokens → Fine-grained tokens*.
   Accès : uniquement `ensam-data`. Permissions du dépôt : **Contents**, **Actions** et **Workflows** en
   *Read and write*. Durée : 1 an.
4. Ouvre l'appli → **Réglages** : colle `<ton-pseudo>/ensam-data` et le jeton → *Tester* → *Enregistrer* →
   *Préparer le dépôt*. Refais la même saisie sur l'iPad.
5. **Emploi du temps** : colle le lien ICS dans Réglages → *Enregistrer et mettre à jour*.
6. **Tâche Claude** : demande à Claude de créer la tâche planifiée qui traite tes cours (la consigne est
   dans Réglages → Traitement par Claude).
7. **Installer** : iPad → Safari → Partager → *Sur l'écran d'accueil*. Mac → Safari → Fichier → *Ajouter au Dock*.

Pour découvrir l'appli sans rien configurer : Réglages → *Essai local* → *Charger des données d'exemple*.

## Organisation du code

Aucune étape de compilation : HTML, CSS et modules JavaScript servis tels quels.

| Fichier | Rôle |
|---|---|
| `index.html`, `css/app.css` | coquille et thème Arts et Métiers (clair / sombre) |
| `js/app.js` | navigation |
| `js/store.js`, `js/github.js`, `js/db.js` | données : API GitHub + cache hors-ligne IndexedDB |
| `js/edt.js` | lecture de l'ICS (récurrences, fuseaux), détection des évaluations |
| `js/views/*.js` | écrans |
| `data-template/` | fichiers copiés dans le dépôt de données par « Préparer le dépôt » (consignes Claude, script, Action) |
| `vendor/` | marked, DOMPurify, KaTeX, ical.js, pdf.js (copies locales) |
| `sw.js` | fonctionnement hors-ligne |

Le jeton GitHub reste dans le navigateur de chaque appareil (jamais dans le dépôt).
