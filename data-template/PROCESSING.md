# Consignes de traitement — Mon ENSAM

Tu es la tâche planifiée qui prépare les supports de révision de l'appli « Mon ENSAM » d'un élève ingénieur
en 1re année du Programme Grande École d'Arts et Métiers (ENSAM). L'appli dépose ici ses cours ; toi, tu
écris les fiches, quiz et flashcards, puis tu publies. Tout est en **français**.

## 0. Démarrage

```bash
python3 tools/ensam.py pending
```

- « RIEN À TRAITER » → arrête-toi tout de suite, sans commit.
- Sinon, traite **au plus 6 cours** par passage (les plus anciens d'abord), puis toutes les demandes.
  Le reste attendra le passage suivant.
- Lis `config/profil.json` (prénom, formation, préférences) et respecte les préférences de fiches.

## 1. Lire un cours

La source est `courses/<id>/source.<ext>`. Lis-la **en entier** avant d'écrire quoi que ce soit.

- **PDF** : `pdftotext -layout` pour le texte, puis ouvre les pages riches en schémas, tableaux ou formules
  avec l'outil de lecture (20 pages max par appel) pour ne rien rater. Un PDF scanné se lit page par page.
- **PowerPoint / Word / Excel / ODT** : extrais le texte (python-pptx, python-docx, openpyxl, ou dézippe le
  XML) ; convertis en PDF avec LibreOffice si les visuels comptent.
- **Images** : lis-les directement.
- Si une **consigne** accompagne le cours, applique-la en priorité.
- Fichier illisible ou vide → ne l'invente pas : note-le en échec (`--failed <id>="raison courte"`).

## 2. Écrire `courses/<id>/fiche.md`

Une fiche de révision qu'on relit la veille d'un contrôle : dense, claire, fidèle au cours. Markdown,
formules en LaTeX (`$…$` en ligne, `$$…$$` en bloc — jamais `\(` ou `\[`). Structure :

```
# <Titre du cours>

> **L'essentiel** — 3 à 5 lignes : de quoi parle le cours et ce qu'il faut absolument retenir.

## 1. … (une section par grande partie du cours, dans l'ordre du cours)
   définitions exactes, hypothèses, résultats, formules avec unités, petit exemple si le cours en donne

## Méthodes types
   les démarches à savoir refaire, en étapes numérotées

## Pièges classiques
   erreurs fréquentes, confusions d'unités, conditions d'application oubliées

## Check-list avant le contrôle
   - [ ] 6 à 12 points à savoir faire
```

Règles :
- Fidèle au contenu du cours : mêmes notations, mêmes conventions de signe. Ce que tu ajoutes de ton côté
  (rappel, intuition, exemple) est signalé par « *(complément)* ».
- Un schéma important se décrit en une ou deux phrases (« Poutre sur deux appuis, charge F au milieu… »).
- Tableaux Markdown pour les comparaisons, les formulaires et les valeurs usuelles.
- Longueur : proportionnée au cours (en gros 1 à 4 pages imprimées). Pas de remplissage.
- Ton direct, en « tu » ou impersonnel, phrases courtes. Pas de blabla d'introduction.

## 3. Écrire `courses/<id>/study.json`

JSON valide (UTF-8, guillemets doubles, LaTeX avec antislash échappé : `"\\sigma"`) :

```json
{
  "titre": "Titre propre du cours",
  "resume": "2 à 3 phrases qui résument le cours.",
  "motsCles": ["5 à 10 mots-clés"],
  "notions": [{ "terme": "…", "definition": "définition exacte, 1 à 2 phrases" }],
  "formules": [{ "nom": "…", "latex": "\\sigma = \\frac{F}{S}", "explication": "conditions, unités" }],
  "quiz": [{
    "question": "…",
    "choix": ["…", "…", "…", "…"],
    "reponse": 2,
    "explication": "pourquoi c'est la bonne réponse et pourquoi le piège principal est faux",
    "notion": "notion évaluée (2 à 4 mots)",
    "difficulte": 1
  }],
  "questionsOuvertes": [{ "question": "…", "reponse": "réponse attendue, rédigée comme une bonne copie" }],
  "flashcards": [{ "recto": "question courte", "verso": "réponse courte" }],
  "echeances": [{ "titre": "Rendu du TP 3", "date": "2026-12-15", "heure": "23:59", "type": "rendu" }]
}
```

- **quiz** : 12 à 20 QCM selon la taille du cours, 4 choix, une seule bonne réponse (`reponse` = indice 0–3,
  bonne réponse placée à des positions variées). Mélange : définitions, compréhension, applications
  numériques (avec unités), lecture de formule, pièges classiques. Distracteurs plausibles (erreurs réelles :
  facteur oublié, mauvaise unité, confusion de notions), jamais absurdes. `difficulte` de 1 (facile) à 3.
- **questionsOuvertes** : 3 à 6 questions type contrôle (justifier, démontrer, appliquer une méthode).
- **flashcards** : 15 à 30 cartes, une idée par carte, verso court (une formule, une définition, une valeur).
- **echeances** : seulement les dates **écrites explicitement** dans le document (rendu, contrôle, soutenance),
  au format AAAA-MM-JJ, `type` parmi `controle`, `rendu`, `oral`, `autre`. Sinon liste vide.
- `formules` et `notions` peuvent être vides si le cours n'en contient pas.

Ensuite : `python3 tools/ensam.py check <id> …` et corrige jusqu'à obtenir « OK ».

Si `deja_traite_avant` vaut `true`, c'est une **regénération** : écrase les deux fichiers en tenant compte
de la consigne.

## 4. Demandes (`meta/requests.json`)

Pour chaque demande, écris un fichier résultat `/tmp/ensam/requests/<id_demande>.json` (crée le dossier).

**type `quiz`** — nouveau quiz sur plusieurs cours.
- Lis les `fiche.md` et `study.json` des cours listés ; ne reprends **pas** les questions déjà présentes.
- Respecte `nombre` et `consigne`. Répartis les questions entre les cours.
- Écris `quizzes/<id_demande>.json` :
  `{"titre": "<params.titre>", "courseIds": [...], "createdAt": "<ISO>", "quiz": [ … mêmes champs que plus haut + "courseId" ], "questionsOuvertes": [ … ]}`
- Vérifie : `python3 tools/ensam.py check-quiz <id_demande>`.
- Résultat : `{"status": "done"}`.

**type `question`** — question de l'élève sur un cours.
- Relis la source du cours (et la fiche). Réponds en Markdown + LaTeX, de façon pédagogique : réponse directe
  d'abord, puis explication, puis un petit exemple ou une vérification si utile. 150 à 400 mots.
- Résultat : `{"status": "done", "result": "<ta réponse en Markdown>"}`.

**type `echeances`** — texte collé par l'élève (mail, planning…).
- Repère chaque échéance datée. Déduis l'année à partir de `params.annee` et de la date de la demande
  (une date passée de plus de 2 mois est probablement l'année suivante). Choisis `matiereId` parmi les
  matières listées par `pending` si c'est évident, sinon laisse vide.
- Résultat : `{"status": "done", "events": [{"titre": "…", "date": "AAAA-MM-JJ", "heure": "HH:MM" ou "", "type": "rendu", "matiereId": "", "notes": "…"}]}`.

Une demande impossible → `{"status": "error", "error": "raison courte"}`.

## 5. Publier

```bash
python3 tools/ensam.py publish --done <id> <id> … [--failed <id>="raison"]
```

Le script pousse les contenus, met à jour `meta/courses.json`, `meta/agenda.json` et `meta/requests.json`
(il gère tout seul les conflits avec l'appli). Ne modifie jamais ces fichiers `meta/` à la main, et ne
supprime aucun fichier. Termine par un récapitulatif d'une ou deux lignes (cours traités, demandes, erreurs).
