from ortools.sat.python import cp_model
import json
import sys


def build_occupied_map(raw_occupied: dict[str, list[dict]]) -> dict[int, set[tuple[int, int]]]:
    occupied: dict[int, set[tuple[int, int]]] = {}
    for class_id_str, slots in raw_occupied.items():
        class_id = int(class_id_str)
        occupied[class_id] = set()
        for item in slots:
            day_order = int(item["day_order"])
            period = int(item["period"])
            occupied[class_id].add((day_order, period))
    return occupied


def get_candidates(
    class_id: int,
    days: list[int],
    periods_per_day: int,
    hours: int,
    occupied: dict[int, set[tuple[int, int]]],
) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    half_split = periods_per_day // 2
    class_occupied = occupied.get(class_id, set())

    morning: list[tuple[int, int]] = []
    afternoon: list[tuple[int, int]] = []

    for day in days:
        max_start = periods_per_day - hours + 1
        for start in range(1, max_start + 1):
            end = start + hours - 1
            if any((day, p) in class_occupied for p in range(start, end + 1)):
                continue

            if end <= half_split:
                morning.append((day, start))
            elif start > half_split:
                afternoon.append((day, start))

    return morning, afternoon


def solve(data: dict) -> dict:
    classes = [int(c) for c in data.get("classes", [])]
    if not classes:
        return {"ok": False, "error": "No classes provided"}

    hours = int(data.get("hours", 2))
    periods_per_day = int(data.get("periods_per_day", 6))
    days = [int(d) for d in data.get("days", [1, 2, 3, 4, 5, 6])]
    occupied = build_occupied_map(data.get("occupied", {}))

    if hours < 2:
        return {"ok": False, "error": "Placement must use at least 2 consecutive periods"}

    if hours > periods_per_day:
        return {"ok": False, "error": "Placement hours cannot exceed periods per day"}

    model = cp_model.CpModel()

    vars_by_class: dict[int, list[tuple[cp_model.IntVar, int, int, str]]] = {}
    morning_vars: list[cp_model.IntVar] = []

    for class_id in classes:
        morning, afternoon = get_candidates(class_id, days, periods_per_day, hours, occupied)
        class_vars: list[tuple[cp_model.IntVar, int, int, str]] = []

        for day, start in morning:
            v = model.NewBoolVar(f"c{class_id}_d{day}_p{start}_m")
            class_vars.append((v, day, start, "morning"))
            morning_vars.append(v)

        for day, start in afternoon:
            v = model.NewBoolVar(f"c{class_id}_d{day}_p{start}_a")
            class_vars.append((v, day, start, "afternoon"))

        if not class_vars:
            return {
                "ok": False,
                "error": f"No available consecutive slots found for class {class_id}",
            }

        vars_by_class[class_id] = class_vars
        model.Add(sum(v for v, _, _, _ in class_vars) == 1)

    morning_target = len(classes) // 2
    model.Add(sum(morning_vars) == morning_target)

    # Prefer earlier days/periods while satisfying constraints.
    objective_terms = []
    for class_vars in vars_by_class.values():
        for v, day, start, _ in class_vars:
            objective_terms.append(v * (day * 100 + start))
    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "ok": False,
            "error": "No feasible placement schedule found with half-morning and half-afternoon constraints",
        }

    assignments = []
    for class_id, class_vars in vars_by_class.items():
        for v, day, start, segment in class_vars:
            if solver.Value(v) == 1:
                periods = list(range(start, start + hours))
                assignments.append(
                    {
                        "class_id": class_id,
                        "day_order": day,
                        "start_period": start,
                        "periods": periods,
                        "segment": segment,
                    }
                )
                break

    return {"ok": True, "assignments": assignments}


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
        result = solve(data)
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"ok": False, "error": str(exc)}))


if __name__ == "__main__":
    main()
