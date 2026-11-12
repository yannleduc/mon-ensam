# ensam-data — données de « Mon ENSAM »

Dépôt **privé** qui contient tout ce que l'appli affiche. Ne le rends jamais public.

| Chemin | Contenu | Écrit par |
|---|---|---|
| `meta/subjects.json` | matières | l'appli |
| `meta/courses.json` | index des cours et leur statut | l'appli + Claude |
| `courses/<id>/source.*` | fichier original du cours | l'appli |
| `courses/<id>/fiche.md`, `study.json` | fiche, résumé, quiz, flashcards | Claude |
| `quizzes/<id>.json` | quiz générés à la demande | Claude |
| `meta/agenda.json` | échéances | l'appli + Claude |
| `meta/requests.json` | demandes à Claude (quiz, questions, échéances) | l'appli + Claude |
| `meta/progress.json` | progression des révisions | l'appli |
| `config/edt.json` | lien ICS de l'emploi du temps | l'appli |
| `edt.ics` | emploi du temps téléchargé | GitHub Actions |
| `PROCESSING.md`, `tools/` | consignes et outils de la tâche Claude | — |
