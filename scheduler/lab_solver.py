from ortools.sat.python import cp_model
import json
import sys


MAX_CANDIDATES = 40


def safe_int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        text = str(value).strip().lower()
        if text in {"nan", "none", "null", ""}:
            return default
        return int(float(text))
    except Exception:
        return default


def split_hours(hours: int) -> list[int]:
    if hours <= 0:
        return []
    if hours <= 2:
        return [hours]

    # For any requirement above 2h/week, split into exactly two sessions.
    left = hours // 2
    right = hours - left
    return [left, right]


def req_type(requirements: str) -> str:
    text = (requirements or "").lower()
    if "kitchen" in text or "catering" in text or "food production" in text:
        return "kitchen"
    return "computer"


def requires_windows11(requirements: str) -> bool:
    text = (requirements or "").lower()
    return "windows 11" in text


def has_any(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def tool_requirements(req_text: str) -> list[list[str]]:
    # Each inner list is an OR-group; all groups must be satisfied.
    groups: list[list[str]] = []
    if has_any(req_text, ["python"]):
        groups.append(["python"])
    if has_any(req_text, ["java", "jdk", "intellij", "eclipse"]):
        groups.append(["java", "jdk", "intellij", "eclipse"])
    if has_any(req_text, ["mysql", "postgresql", "oracle", "database", "db", "dbeaver", "workbench"]):
        groups.append(["mysql", "postgresql", "oracle", "database", "db", "dbeaver", "workbench"])
    if has_any(req_text, ["gcc", "turbo c", "codeblocks", "c++", "c /"]):
        groups.append(["gcc", "turbo c", "codeblocks", "c++", "compiler"])
    if has_any(req_text, ["node", "javascript", "html", "css", "web"]):
        groups.append(["node", "javascript", "html", "css", "browser", "web"])
    if has_any(req_text, ["office", "libreoffice", "ms office"]):
        groups.append(["office", "libreoffice"])
    if has_any(req_text, ["hadoop", "spark", "big data"]):
        groups.append(["hadoop", "spark", "big data"])
    if has_any(req_text, ["tensorflow", "scikit", "pandas", "numpy", "machine learning"]):
        groups.append(["tensorflow", "scikit", "pandas", "numpy", "machine learning", "ml"])
    return groups


def lab_matches(req: dict, lab: dict) -> bool:
    req_text = " ".join(
        [
            (req.get("requirements") or ""),
            (req.get("subject_name") or ""),
            (req.get("subject_code") or ""),
        ]
    ).lower()
    lab_text = " ".join(
        [
            (lab.get("name") or ""),
            (lab.get("os_installed") or ""),
            (lab.get("system_spec") or ""),
        ]
    ).lower()

    if safe_int(lab.get("systems"), 0) < safe_int(req.get("class_strength"), 0):
        return False

    if req_type(req_text) == "kitchen":
        if "kitchen" not in lab_text and "cater" not in lab_text:
            return False
    else:
        if "kitchen" in lab_text or "cater" in lab_text:
            return False

    if requires_windows11(req_text) and "windows 11" not in lab_text:
        return False

    if "linux" in req_text and not has_any(lab_text, ["linux", "ubuntu", "debian"]):
        return False

    for group in tool_requirements(req_text):
        if not has_any(lab_text, group):
            return False

    return True


def to_blocked_map(raw: dict) -> dict[tuple[int, int], bool]:
    out: dict[tuple[int, int], bool] = {}
    for item in raw:
        day = safe_int(item.get("day_order"), 0)
        period = safe_int(item.get("period"), 0)
        if day >= 1 and period >= 1:
            out[(day, period)] = True
    return out


def solve(data: dict) -> dict:
    requirements = data.get("classes", [])
    labs = data.get("labs", [])
    periods_per_day = max(1, safe_int(data.get("periods_per_day", 6), 6))
    days = [d for d in (safe_int(d, 0) for d in data.get("days", [1, 2, 3, 4, 5, 6])) if d >= 1]
    if not days:
        days = [1, 2, 3, 4, 5, 6]

    blocked = data.get("blocked", {})
    class_blocked_raw = blocked.get("class_slots", {})
    lab_blocked_raw = blocked.get("lab_slots", {})

    if not requirements:
        return {"ok": False, "error": "No lab requirements provided."}
    if not labs:
        return {"ok": False, "error": "No labs provided."}

    class_blocked: dict[int, dict[tuple[int, int], bool]] = {}
    for k, slots in class_blocked_raw.items():
        class_id = safe_int(k, 0)
        if class_id >= 1:
            class_blocked[class_id] = to_blocked_map(slots)

    lab_blocked: dict[int, dict[tuple[int, int], bool]] = {}
    for k, slots in lab_blocked_raw.items():
        lab_id = safe_int(k, 0)
        if lab_id >= 1:
            lab_blocked[lab_id] = to_blocked_map(slots)

    compatible_labs: dict[int, list[int]] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        compatible_labs[req_id] = [safe_int(l.get("id"), 0) for l in labs if safe_int(l.get("id"), 0) >= 1 and lab_matches(req, l)]

    print(f"Total requirements: {len(requirements)}", file=sys.stderr)
    print(f"Total labs: {len(labs)}", file=sys.stderr)
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        print(f"Req {req_id} compatible labs: {compatible_labs.get(req_id, [])}", file=sys.stderr)

    # Heuristic ordering before CP-SAT: harder requests first.
    requirements = sorted(
        requirements,
        key=lambda r: (
            len(compatible_labs.get(safe_int(r.get("id"), 0), [])),
            -safe_int(r.get("class_strength"), 0),
            -safe_int(r.get("lab_hours"), 0),
        ),
    )

    sessions: list[dict] = []
    req_session_ids: dict[int, list[str]] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        pieces = split_hours(safe_int(req.get("lab_hours"), 0))
        if not pieces:
            continue
        req_session_ids.setdefault(req_id, [])
        for idx, length in enumerate(pieces):
            sid = f"{req_id}_{idx}"
            sessions.append(
                {
                    "session_id": sid,
                    "req_id": req_id,
                    "class_id": safe_int(req.get("class_id"), 0),
                    "subject_id": safe_int(req.get("subject_id"), 0),
                    "length": safe_int(length, 0),
                    "requirements": req.get("requirements") or "",
                }
            )
            req_session_ids[req_id].append(sid)

    if not sessions:
        return {"ok": False, "error": "No session blocks generated from lab hours."}

    model = cp_model.CpModel()
    req_active: dict[int, cp_model.IntVar] = {}
    req_impossible: set[int] = set()
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        req_active[req_id] = model.NewBoolVar(f"req_active_{req_id}")
        if not compatible_labs[req_id]:
            req_impossible.add(req_id)
            model.Add(req_active[req_id] == 0)

    choose_lab: dict[tuple[int, int], cp_model.IntVar] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        vars_for_req = []
        for lab_id in compatible_labs[req_id]:
            v = model.NewBoolVar(f"choose_req{req_id}_lab{lab_id}")
            choose_lab[(req_id, lab_id)] = v
            vars_for_req.append(v)
        if vars_for_req:
            model.Add(sum(vars_for_req) == req_active[req_id])

    assign: dict[tuple[str, int, int, int], cp_model.IntVar] = {}
    session_candidates: dict[str, list[tuple[int, int, int]]] = {}

    for s in sessions:
        sid = s["session_id"]
        req_id = s["req_id"]
        class_id = s["class_id"]
        length = s["length"]

        candidates: list[tuple[int, int, int]] = []
        for lab_id in compatible_labs[req_id]:
            for day in days:
                for start in range(1, periods_per_day - length + 2):
                    blocked_flag = False
                    for p in range(start, start + length):
                        if class_blocked.get(class_id, {}).get((day, p), False):
                            blocked_flag = True
                            break
                        if lab_blocked.get(lab_id, {}).get((day, p), False):
                            blocked_flag = True
                            break
                    if blocked_flag:
                        continue

                    v = model.NewBoolVar(f"x_{sid}_l{lab_id}_d{day}_s{start}")
                    assign[(sid, lab_id, day, start)] = v
                    candidates.append((lab_id, day, start))
                    model.Add(v <= choose_lab[(req_id, lab_id)])

                candidates = candidates[:MAX_CANDIDATES]
        session_candidates[sid] = candidates
        if candidates:
            model.Add(sum(assign[(sid, l, d, st)] for (l, d, st) in candidates) == req_active[req_id])
        else:
            req_impossible.add(req_id)
            model.Add(req_active[req_id] == 0)

    # If a requirement is split across multiple sessions, place them on different days.
    for req in requirements:
        req_id = int(req["id"])
        session_ids = req_session_ids.get(req_id, [])
        if len(session_ids) <= 1:
            continue

        for day in days:
            same_day_vars = []
            for sid in session_ids:
                for lab_id, d, start in session_candidates.get(sid, []):
                    if d == day:
                        same_day_vars.append(assign[(sid, lab_id, d, start)])
            if same_day_vars:
                model.Add(sum(same_day_vars) <= 1)

    # Class conflict: a class cannot have 2 lab sessions at the same period.
    class_ids = sorted({s["class_id"] for s in sessions})
    for class_id in class_ids:
        class_sessions = [s for s in sessions if s["class_id"] == class_id]
        for day in days:
            for period in range(1, periods_per_day + 1):
                covering_vars = []
                for s in class_sessions:
                    sid = s["session_id"]
                    length = s["length"]
                    for lab_id, d, start in session_candidates[sid]:
                        if d != day:
                            continue
                        if start <= period < start + length:
                            covering_vars.append(assign[(sid, lab_id, d, start)])
                if covering_vars:
                    model.Add(sum(covering_vars) <= 1)

    # Lab conflict: a lab cannot host 2 classes at the same period.
    lab_ids = [int(l["id"]) for l in labs]
    for lab_id in lab_ids:
        lab_sessions = [s for s in sessions if lab_id in compatible_labs[s["req_id"]]]
        for day in days:
            for period in range(1, periods_per_day + 1):
                covering_vars = []
                for s in lab_sessions:
                    sid = s["session_id"]
                    length = s["length"]
                    for l, d, start in session_candidates[sid]:
                        if l != lab_id or d != day:
                            continue
                        if start <= period < start + length:
                            covering_vars.append(assign[(sid, l, d, start)])
                if covering_vars:
                    model.Add(sum(covering_vars) <= 1)

    # Objective: maximize assigned requirements first, then prefer earlier scheduling.
    reward_terms = [req_active[int(req["id"])] * 1_000_000 for req in requirements]
    objective_terms = []
    for s in sessions:
        sid = s["session_id"]
        for lab_id, day, start in session_candidates[sid]:
            score = day * 100 + start
            objective_terms.append(assign[(sid, lab_id, day, start)] * score)
    model.Maximize(sum(reward_terms) - sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"ok": False, "error": "No feasible lab schedule found with current constraints."}

    output = []
    req_assigned: dict[int, bool] = {int(req["id"]): False for req in requirements}
    for s in sessions:
        sid = s["session_id"]
        req_id = s["req_id"]
        class_id = s["class_id"]
        subject_id = s["subject_id"]
        length = s["length"]
        chosen = None
        for lab_id, day, start in session_candidates[sid]:
            if solver.Value(assign[(sid, lab_id, day, start)]) == 1:
                chosen = (lab_id, day, start)
                break

        if not chosen:
            continue

        req_assigned[req_id] = True

        lab_id, day, start = chosen
        group = f"req{req_id}_d{day}_s{start}_l{lab_id}"
        for period in range(start, start + length):
            output.append(
                {
                    "lab_requirement_id": req_id,
                    "class_id": class_id,
                    "subject_id": subject_id,
                    "lab_id": lab_id,
                    "day_order": day,
                    "period": period,
                    "preview_group": group,
                }
            )

    unassigned = [req_id for req_id, ok in req_assigned.items() if not ok]
    for req_id in sorted(req_impossible):
        if req_id not in unassigned:
            unassigned.append(req_id)

    return {"ok": True, "assignments": output, "unassigned": sorted(unassigned)}


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read())
        result = solve(payload)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
