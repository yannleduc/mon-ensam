// Données d'exemple pour le mode « essai local »
import { store, PATHS } from './store.js';
import { idb } from './db.js';
import { ymd, DAY } from './ui.js';

const FICHE = `# Flexion simple des poutres

> **L’essentiel** — En flexion simple, une poutre est soumise à un moment fléchissant $M_f$ et à un effort tranchant $T$. La contrainte normale varie linéairement dans la hauteur de la section : nulle sur la fibre neutre, maximale sur les fibres extrêmes.

## 1. Hypothèses
- Matériau homogène, isotrope, élastique linéaire (loi de Hooke).
- Petites déformations, sections planes qui restent planes (Navier–Bernoulli).
- Poutre droite, chargée dans un plan de symétrie.

## 2. Contrainte normale
La contrainte dans une section à la distance $y$ de la fibre neutre vaut :

$$\\sigma(y) = -\\frac{M_f}{I_{Gz}}\\, y$$

Le maximum est atteint en $|y| = v$ :

$$\\sigma_{max} = \\frac{|M_f|_{max}}{I_{Gz}/v}$$

Le quotient $I_{Gz}/v$ est le **module de flexion**.

## 3. Moments quadratiques usuels
| Section | $I_{Gz}$ |
|---|---|
| Rectangle $b \\times h$ | $\\dfrac{b h^3}{12}$ |
| Disque plein de diamètre $d$ | $\\dfrac{\\pi d^4}{64}$ |

## 4. Méthode type
1. Isoler la poutre, calculer les actions aux appuis (PFS).
2. Tracer $T(x)$ et $M_f(x)$ ; repérer la section la plus sollicitée.
3. Calculer $\\sigma_{max}$ et vérifier $\\sigma_{max} \\le \\sigma_{adm} = R_e / s$.

## Pièges classiques
- Oublier que $h$ est **au cube** dans $I_{Gz}$ : poser une planche à plat ou sur chant change tout.
- Confondre $I_{Gz}$ (cm⁴) et module de flexion (cm³).
`;

const STUDY = {
  titre: 'Flexion simple des poutres',
  resume: 'Contraintes normales en flexion simple, moments quadratiques et méthode de dimensionnement d’une poutre.',
  motsCles: ['flexion', 'moment fléchissant', 'moment quadratique', 'Navier-Bernoulli'],
  notions: [
    { terme: 'Fibre neutre', definition: 'Ligne de la section où la contrainte normale est nulle ; elle passe par le centre de gravité en flexion simple.' },
    { terme: 'Module de flexion', definition: 'Rapport $I_{Gz}/v$, caractérise la résistance de la section à la flexion (en cm³).' },
  ],
  formules: [
    { nom: 'Contrainte normale', latex: '\\sigma = -\\frac{M_f}{I_{Gz}} y', explication: 'Linéaire dans la hauteur' },
    { nom: 'Rectangle', latex: 'I_{Gz} = \\frac{bh^3}{12}', explication: 'h dans le sens de la flexion' },
  ],
  quiz: [
    { question: 'Où la contrainte normale est-elle maximale en flexion simple ?', choix: ['Sur la fibre neutre', 'Sur les fibres extrêmes', 'Au centre de gravité', 'Elle est uniforme'], reponse: 1, explication: '$\\sigma$ est proportionnelle à $y$, donc maximale pour $|y| = v$.', notion: 'Contrainte normale' },
    { question: 'Si on double la hauteur $h$ d’une section rectangulaire, $I_{Gz}$ est multiplié par :', choix: ['2', '4', '8', '16'], reponse: 2, explication: '$I_{Gz} = bh^3/12$ : $2^3 = 8$.', notion: 'Moment quadratique' },
    { question: 'Quelle hypothèse dit que les sections droites restent planes ?', choix: ['Saint-Venant', 'Navier–Bernoulli', 'Hooke', 'Coulomb'], reponse: 1, explication: 'C’est l’hypothèse de Navier–Bernoulli.', notion: 'Hypothèses' },
    { question: 'L’unité usuelle du module de flexion $I_{Gz}/v$ est :', choix: ['cm²', 'cm³', 'cm⁴', 'MPa'], reponse: 1, explication: 'cm⁴ divisé par cm donne des cm³.', notion: 'Module de flexion' },
  ],
  questionsOuvertes: [{ question: 'Pourquoi pose-t-on une planche sur chant plutôt qu’à plat pour franchir une portée ?', reponse: 'Parce que $I_{Gz}$ dépend de $h^3$ : sur chant, la grande dimension est dans le sens de la flexion, la poutre est beaucoup plus rigide et résistante.' }],
  flashcards: [
    { recto: 'Formule de la contrainte normale en flexion', verso: '$\\sigma = -\\dfrac{M_f}{I_{Gz}}\\,y$' },
    { recto: '$I_{Gz}$ d’un rectangle $b \\times h$', verso: '$\\dfrac{bh^3}{12}$' },
    { recto: 'Critère de résistance', verso: '$\\sigma_{max} \\le R_e / s$' },
  ],
  echeances: [],
};

function demoIcs() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const f = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const slots = [
    [0, 8, 10, 'CM Mécanique des solides', 'Amphi A'], [0, 10.25, 12.25, 'TD Analyse de la valeur', 'Salle 204'], [0, 13.5, 17.5, 'TP Fabrication additive', 'Atelier FA'],
    [1, 8, 10, 'CM Thermodynamique', 'Amphi B'], [1, 10.25, 12.25, 'TD Mécanique des solides', 'Salle 112'],
    [2, 9, 12, 'Projet pied prothétique', 'Salle projet'], [3, 8, 10, 'CM Mathématiques', 'Amphi A'], [3, 14, 16, 'Anglais', 'Salle 015'],
    [4, 8, 10, 'Contrôle Mécanique des solides', 'Amphi C'], [7, 8, 10, 'CM Mécanique des solides', 'Amphi A'], [9, 14, 16, 'Soutenance projet AV', 'Salle 210'],
  ];
  const ev = slots.map(([d, h0, h1, t, l], i) => {
    const s = new Date(+monday + d * DAY); s.setHours(Math.floor(h0), (h0 % 1) * 60);
    const e = new Date(+monday + d * DAY); e.setHours(Math.floor(h1), (h1 % 1) * 60);
    return `BEGIN:VEVENT\r\nUID:demo-${i}\r\nDTSTAMP:${f(now)}\r\nDTSTART:${f(s)}\r\nDTEND:${f(e)}\r\nSUMMARY:${t}\r\nLOCATION:${l}\r\nEND:VEVENT`;
  });
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:demo\r\n${ev.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
}

const MINI_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 120>>stream
BT /F1 28 Tf 60 760 Td (Cours exemple : flexion simple) Tj 0 -40 Td /F1 14 Tf (Document de demonstration de Mon ENSAM.) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;

export async function seedDemo() {
  const b = store.backend;
  const w = (p, o) => b.write(p, typeof o === 'string' ? o : JSON.stringify(o, null, 2));
  const now = new Date().toISOString();
  await w(PATHS.subjects, { subjects: [
    { id: 'meca', name: 'Mécanique des solides', color: '#80276C', ue: 'UE Mécanique' },
    { id: 'av', name: 'Analyse de la valeur', color: '#FFA300', ue: 'UE Conception' },
    { id: 'fa', name: 'Fabrication additive', color: '#1b7f8c', ue: 'UE Procédés' },
  ] });
  await w(PATHS.courses, { courses: [
    { id: 'demo-flexion', subjectId: 'meca', title: 'Flexion simple des poutres', fileName: 'flexion.pdf', ext: 'pdf', size: MINI_PDF.length, addedAt: now, processedAt: now, status: 'done', summary: STUDY.resume, keywords: STUDY.motsCles },
    { id: 'demo-cdcf', subjectId: 'av', title: 'Cahier des charges fonctionnel', fileName: 'cdcf.pdf', ext: 'pdf', size: MINI_PDF.length, addedAt: now, status: 'pending' },
  ] });
  await w('courses/demo-flexion/source.pdf', MINI_PDF);
  await w('courses/demo-cdcf/source.pdf', MINI_PDF);
  await w('courses/demo-flexion/fiche.md', FICHE);
  await w('courses/demo-flexion/study.json', STUDY);
  const d = (n) => ymd(new Date(Date.now() + n * DAY));
  await w(PATHS.agenda, { events: [
    { id: 'ev-1', title: 'Rendu rapport TP éléments finis', type: 'rendu', date: d(2), time: '23:59', subjectId: 'meca', notes: 'Dépôt sur la plateforme', done: false, source: 'manuel' },
    { id: 'ev-2', title: 'Oral projet pied prothétique', type: 'oral', date: d(12), time: '14:00', subjectId: 'av', notes: '', done: false, source: 'manuel' },
  ] });
  await w(PATHS.progress, { cards: {}, questions: {}, sessions: [] });
  await w(PATHS.requests, { requests: [] });
  await w(PATHS.ics, demoIcs());
  await idb.set('edt:manual', demoIcs());
}
