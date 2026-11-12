#!/usr/bin/env python3
"""Outils pour la tâche Claude qui traite le dépôt « Mon ENSAM ».

  python3 tools/ensam.py pending
      Liste ce qui attend un traitement (cours + demandes). Affiche « RIEN À TRAITER » sinon.

  python3 tools/ensam.py check <id_cours> [<id_cours> ...]
      Vérifie fiche.md et study.json des cours indiqués (à lancer avant publish).

  python3 tools/ensam.py check-quiz <id_demande>
      Vérifie quizzes/<id>.json.

  python3 tools/ensam.py publish --done ID ... [--failed ID=message ...] [--results DOSSIER]
      1) commit + push des fichiers générés (courses/, quizzes/)
      2) mise à jour des index meta/*.json sur une copie fraîche du dépôt, avec nouvelles
         tentatives si l'appli a écrit entre-temps.
      DOSSIER (défaut /tmp/ensam/requests) contient un <id_demande>.json par demande traitée.
"""
import argparse, datetime as dt, json, os, re, subprocess, sys, time, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def git(*args, check=True):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} : {r.stderr.strip() or r.stdout.strip()}")
    return r


def branch():
    return git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "main"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- pending
def cmd_pending(_):
    courses = load("meta/courses.json", {"courses": []}).get("courses", [])
    subjects = {s["id"]: s for s in load("meta/subjects.json", {"subjects": []}).get("subjects", [])}
    reqs = [r for r in load("meta/requests.json", {"requests": []}).get("requests", []) if r.get("status") == "pending"]
    todo = [c for c in courses if c.get("status") == "pending"]
    if not todo and not reqs:
        print("RIEN À TRAITER")
        return
    profil = load("config/profil.json", {})
    print("PROFIL :", json.dumps(profil, ensure_ascii=False))
    print(f"\n=== {len(todo)} COURS EN ATTENTE ===")
    for c in todo:
        s = subjects.get(c.get("subjectId"), {})
        print(json.dumps({
            "id": c["id"], "titre": c.get("title"), "matiere": s.get("name", "?"),
            "source": f"courses/{c['id']}/source.{c.get('ext', 'pdf')}", "consigne": c.get("note") or "",
            "deja_traite_avant": os.path.exists(f"courses/{c['id']}/study.json"),
        }, ensure_ascii=False))
    print(f"\n=== {len(reqs)} DEMANDE(S) EN ATTENTE ===")
    by_id = {c["id"]: c for c in courses}
    for r in reqs:
        p = dict(r.get("params", {}))
        if r["type"] == "quiz":
            p["cours"] = [{"id": i, "titre": by_id.get(i, {}).get("title"), "fiche": f"courses/{i}/fiche.md", "study": f"courses/{i}/study.json"} for i in p.get("courseIds", [])]
        if r["type"] == "question":
            c = by_id.get(p.get("courseId"), {})
            p["cours"] = {"titre": c.get("title"), "source": f"courses/{c.get('id')}/source.{c.get('ext', 'pdf')}", "fiche": f"courses/{c.get('id')}/fiche.md"}
        print(json.dumps({"id": r["id"], "type": r["type"], "params": p}, ensure_ascii=False))
    print("\nMatières :", json.dumps([{"id": k, "nom": v.get("name")} for k, v in subjects.items()], ensure_ascii=False))


# ---------------------------------------------------------------- vérifications
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def check_quiz_items(items, where):
    errs = []
    if not isinstance(items, list) or not items:
        return [f"{where} : liste « quiz » vide"]
    for i, q in enumerate(items):
        ch = q.get("choix")
        if not q.get("question") or not isinstance(ch, list) or len(ch) < 2:
            errs.append(f"{where} quiz[{i}] : question ou choix manquants")
        elif not isinstance(q.get("reponse"), int) or not 0 <= q["reponse"] < len(ch):
            errs.append(f"{where} quiz[{i}] : « reponse » doit être l'indice (0..{len(ch) - 1}) du bon choix")
        elif len(set(map(str, ch))) != len(ch):
            errs.append(f"{where} quiz[{i}] : choix en double")
    return errs


def check_course(cid):
    errs = []
    base = f"courses/{cid}"
    try:
        fiche = open(f"{base}/fiche.md", encoding="utf-8").read()
        if len(fiche.strip()) < 300:
            errs.append(f"{cid} : fiche.md trop courte")
    except FileNotFoundError:
        errs.append(f"{cid} : fiche.md absente")
    try:
        s = json.load(open(f"{base}/study.json", encoding="utf-8"))
    except FileNotFoundError:
        return errs + [f"{cid} : study.json absent"]
    except json.JSONDecodeError as e:
        return errs + [f"{cid} : study.json invalide ({e})"]
    if not isinstance(s.get("resume"), str) or not s["resume"].strip():
        errs.append(f"{cid} : « resume » manquant")
    errs += check_quiz_items(s.get("quiz"), cid)
    fc = s.get("flashcards")
    if not isinstance(fc, list) or not fc or any(not f.get("recto") or not f.get("verso") for f in fc):
        errs.append(f"{cid} : flashcards manquantes ou incomplètes")
    for e in s.get("echeances", []) or []:
        if not DATE_RE.match(str(e.get("date", ""))):
            errs.append(f"{cid} : échéance « {e.get('titre')} » sans date AAAA-MM-JJ (mets-la à null ou retire-la)")
    return errs


def cmd_check(a):
    errs = [e for cid in a.ids for e in check_course(cid)]
    print("\n".join(errs) if errs else "OK")
    sys.exit(1 if errs else 0)


def cmd_check_quiz(a):
    try:
        q = json.load(open(f"quizzes/{a.id}.json", encoding="utf-8"))
        errs = check_quiz_items(q.get("quiz"), a.id)
    except Exception as e:  # noqa
        errs = [str(e)]
    print("\n".join(errs) if errs else "OK")
    sys.exit(1 if errs else 0)


# ---------------------------------------------------------------- publication
def apply_meta(done, failed, results):
    stamp = now()
    courses_doc = load("meta/courses.json", {"courses": []})
    agenda = load("meta/agenda.json", {"events": []})
    agenda.setdefault("events", [])
    seen = {(e.get("title", "").lower(), e.get("date")) for e in agenda["events"]}

    def add_event(e, subject_id=""):
        date = str(e.get("date") or "")
        if not DATE_RE.match(date):
            return
        key = (str(e.get("titre", "")).lower(), date)
        if key in seen:
            return
        seen.add(key)
        agenda["events"].append({
            "id": "ev-" + uuid.uuid4().hex[:8], "title": e.get("titre", "Échéance"), "type": e.get("type") if e.get("type") in ("controle", "rendu", "oral", "autre") else "autre",
            "date": date, "time": e.get("heure") or "", "subjectId": e.get("matiereId") or subject_id, "notes": e.get("notes", ""),
            "done": False, "source": "claude",
        })

    for c in courses_doc.get("courses", []):
        if c["id"] in done:
            s = load(f"courses/{c['id']}/study.json", {})
            c.update(status="done", processedAt=stamp, summary=s.get("resume", ""), keywords=s.get("motsCles", [])[:10])
            if s.get("titre") and c.get("title", "").strip().lower() in ("", c.get("fileName", "").rsplit(".", 1)[0].lower()):
                c["title"] = s["titre"]
            c.pop("error", None)
            for e in s.get("echeances", []) or []:
                add_event(e, c.get("subjectId", ""))
        elif c["id"] in failed:
            c.update(status="error", error=failed[c["id"]][:300], processedAt=stamp)

    reqs_doc = load("meta/requests.json", {"requests": []})
    for r in reqs_doc.get("requests", []):
        res = results.get(r["id"])
        if not res or r.get("status") != "pending":
            continue
        r["status"] = res.get("status", "done")
        r["doneAt"] = stamp
        if res.get("error"):
            r["error"] = res["error"]
        if r["type"] == "quiz" and r["status"] == "done":
            r["result"] = f"quizzes/{r['id']}.json"
        elif r["type"] == "question":
            r["result"] = res.get("result", "")
        elif r["type"] == "echeances":
            evs = res.get("events", [])
            for e in evs:
                add_event(e)
            r["result"] = f"{len(evs)} échéance(s) ajoutée(s)"
    # garder la liste de demandes raisonnable
    reqs_doc["requests"] = [r for r in reqs_doc.get("requests", []) if r.get("status") == "pending"] + \
        [r for r in reqs_doc.get("requests", []) if r.get("status") != "pending"][-150:]
    save("meta/courses.json", courses_doc)
    save("meta/agenda.json", agenda)
    save("meta/requests.json", reqs_doc)


def push_with_retry(msg, paths):
    git("add", "-A", *paths)
    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        return False
    git("-c", "user.name=Claude", "-c", "user.email=claude@users.noreply.github.com", "commit", "-m", msg)
    b = branch()
    for i in range(5):
        if git("push", "origin", f"HEAD:{b}", check=False).returncode == 0:
            return True
        git("pull", "--rebase", "origin", b)
        time.sleep(2 * (i + 1))
    raise RuntimeError("push impossible après 5 tentatives")


def cmd_publish(a):
    done = set(a.done or [])
    failed = dict(x.split("=", 1) if "=" in x else (x, "Erreur de traitement") for x in (a.failed or []))
    results = {}
    if os.path.isdir(a.results):
        for f in os.listdir(a.results):
            if f.endswith(".json"):
                results[f[:-5]] = load(os.path.join(a.results, f), {})
    bad = [e for cid in done for e in check_course(cid)]
    if bad:
        print("Fichiers invalides, corrige-les avant de publier :\n" + "\n".join(bad))
        sys.exit(1)
    # 1) contenus générés (chemins uniques : pas de conflit possible)
    paths = [p for p in ("courses", "quizzes") if os.path.isdir(p)]
    if paths:
        pushed = push_with_retry(f"Claude : {len(done)} fiche(s), {len(results)} demande(s)", paths)
        print("Contenus poussés." if pushed else "Aucun nouveau contenu.")
    # 2) index : toujours repartir de la version distante la plus récente
    b = branch()
    for i in range(6):
        git("fetch", "origin", b)
        git("reset", "--hard", f"origin/{b}")
        apply_meta(done, failed, results)
        git("add", "meta")
        if git("diff", "--cached", "--quiet", check=False).returncode == 0:
            print("Index déjà à jour.")
            return
        git("-c", "user.name=Claude", "-c", "user.email=claude@users.noreply.github.com", "commit", "-m", "Claude : mise à jour des index")
        if git("push", "origin", f"HEAD:{b}", check=False).returncode == 0:
            print(f"Publié : {len(done)} cours prêts, {len(failed)} en erreur, {len(results)} demande(s).")
            return
        time.sleep(2 * (i + 1))
    raise RuntimeError("impossible de publier les index")


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("pending").set_defaults(f=cmd_pending)
    c = sp.add_parser("check"); c.add_argument("ids", nargs="+"); c.set_defaults(f=cmd_check)
    q = sp.add_parser("check-quiz"); q.add_argument("id"); q.set_defaults(f=cmd_check_quiz)
    pb = sp.add_parser("publish")
    pb.add_argument("--done", nargs="*", default=[])
    pb.add_argument("--failed", nargs="*", default=[])
    pb.add_argument("--results", default="/tmp/ensam/requests")
    pb.set_defaults(f=cmd_publish)
    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
