"""Export completed 2026 first-team games from the archived SQLite database."""

import argparse
import json
import sqlite3
from pathlib import Path


def export_games(connection):
    model, as_of = connection.execute("""
        SELECT model_version, MAX(snapshot_date)
        FROM player_rating_snapshots
        WHERE season = 2026 AND model_version LIKE 'kpi-v4.2-%'
        GROUP BY model_version
        ORDER BY MAX(snapshot_date) DESC, MAX(model_run_id) DESC
        LIMIT 1
    """).fetchone()

    games = {}
    for row in connection.execute("""
        SELECT g.game_id, g.game_date, g.game_type_raw, home.team_code, away.team_code,
               home_line.runs, away_line.runs
        FROM games g
        JOIN teams home ON home.team_id = g.home_team_id
        JOIN teams away ON away.team_id = g.away_team_id
        LEFT JOIN game_team_lines home_line ON home_line.game_id = g.game_id
            AND home_line.team_id = g.home_team_id AND home_line.home_away = 'home'
        LEFT JOIN game_team_lines away_line ON away_line.game_id = g.game_id
            AND away_line.team_id = g.away_team_id AND away_line.home_away = 'away'
        WHERE g.season = 2026 AND g.league_code = 'major' AND g.status = 'completed'
            AND g.game_date <= ? AND COALESCE(g.inclusion_status, '') NOT IN ('excluded', '제외')
        ORDER BY g.game_date DESC, g.source_game_id DESC
    """, (as_of,)):
        game_id, date, game_type, home, away, home_runs, away_runs = row
        games[game_id] = {
            "id": game_id, "date": date, "stage": game_type,
            "home": home, "away": away, "homeRuns": home_runs, "awayRuns": away_runs,
            "movements": {},
        }

    for game_id, team_id, player_id, name, delta in connection.execute("""
        WITH game_effects AS (
            SELECT pa.game_id, effect.player_id, effect.delta,
                   CASE effect.role WHEN 'batter' THEN pa.batting_team_id ELSE pa.fielding_team_id END AS team_id,
                   CASE effect.role WHEN 'batter' THEN pa.raw_batter_name ELSE pa.raw_pitcher_name END AS name
            FROM pa_rating_effects effect
            JOIN plate_appearances pa USING (pa_id)
            JOIN games g ON g.game_id = pa.game_id
            WHERE effect.model_version = ? AND effect.metric_name = 'rating_normalized'
                AND g.season = 2026 AND g.league_code = 'major'
        )
        SELECT effect.game_id, team.team_code, effect.player_id, MAX(effect.name), SUM(effect.delta)
        FROM game_effects effect
        JOIN teams team USING (team_id)
        GROUP BY effect.game_id, team.team_code, effect.player_id
        ORDER BY effect.game_id, team.team_code, SUM(effect.delta) DESC, effect.player_id
    """, (model,)):
        if game_id not in games or not name or not delta or abs(delta) < 0.05:
            continue
        game = games[game_id]
        if team_id not in (game["home"], game["away"]):
            continue
        leaders = game["movements"].setdefault(team_id, {})
        player = {"playerId": player_id, "name": name, "delta": round(delta, 1)}
        if delta > 0:
            leaders.setdefault("up", player)
        else:
            leaders["down"] = player

    return {"season": 2026, "asOf": as_of, "modelVersion": model, "games": list(games.values())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    with sqlite3.connect(f"{args.database.resolve().as_uri()}?mode=ro", uri=True) as connection:
        archive = export_games(connection)
    target = Path(__file__).resolve().parents[1] / "data" / "team-games-2026.json"
    games = archive.pop("games")
    header = json.dumps(archive, ensure_ascii=False)[:-1]
    rows = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in games)
    target.write_text(f'{header}, "games": [\n{rows}\n]}}\n', encoding="utf-8")
    print(f"{len(games)} games through {archive['asOf']}")
