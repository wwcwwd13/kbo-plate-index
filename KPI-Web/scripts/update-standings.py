"""Refresh the published 1군 standings snapshot from KBO's daily table.

Run after the daily rating update, before building/publishing the frontend.
An invalid or incomplete response leaves the existing JSON untouched.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen


SOURCE = "https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "standings.json"
KNOWN_TEAMS = {"KT", "삼성", "LG", "KIA", "두산", "NC", "롯데", "SSG", "한화", "키움"}


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.rows: list[list[list[str]]] = []
        self.table: list[list[str]] | None = None
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self.depth += 1
            if self.depth == 1:
                self.table = []
        elif self.depth == 1 and tag == "tr":
            self.row = []
        elif self.depth == 1 and tag in {"th", "td"}:
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.depth == 1 and tag in {"th", "td"} and self.cell is not None:
            if self.row is not None:
                self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif self.depth == 1 and tag == "tr" and self.row is not None:
            if self.table is not None:
                self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.depth:
            if self.depth == 1 and self.table is not None:
                self.rows.append(self.table)
                self.table = None
            self.depth -= 1


def parse_standings(html: str) -> dict:
    parser = TableParser()
    parser.feed(html)
    for table in parser.rows:
        if not table or not {"순위", "팀명"}.issubset(set(table[0])):
            continue
        teams = []
        for row in table[1:]:
            if len(row) >= 2 and row[0].isdigit() and row[1] in KNOWN_TEAMS:
                teams.append({"rank": int(row[0]), "team": row[1]})
        if len(teams) != 10 or {item["rank"] for item in teams} != set(range(1, 11)):
            continue
        if {item["team"] for item in teams} != KNOWN_TEAMS:
            continue
        page_text = " ".join(unescape(re.sub(r"<[^>]*>", " ", html)).split())
        date_match = re.search(r"\(\s*(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일\s*기준\s*\)", page_text)
        if not date_match:
            raise ValueError("KBO 순위표의 기준일을 확인할 수 없습니다.")
        year, month, day = map(int, date_match.groups())
        as_of = f"{year:04d}-{month:02d}-{day:02d}"
        return {
            "source": SOURCE,
            "checkedAt": datetime.now(timezone(timedelta(hours=9))).date().isoformat(),
            "asOf": as_of,
            "season": year,
            "teams": teams,
        }
    raise ValueError("KBO 일자별 팀 순위표에서 10개 구단을 찾지 못했습니다.")


def main() -> None:
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--run-manifest", type=Path, help="daily_update.py run의 manifest.json 경로")
    args = arguments.parse_args()
    request = Request(SOURCE, headers={"User-Agent": "Mozilla/5.0 (KPI standings updater)"})
    with urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8-sig")
    data = parse_standings(html)
    if args.run_manifest:
        run = json.loads(args.run_manifest.read_text(encoding="utf-8"))
        run_date = run["as_of"]
        if data["asOf"] > run_date or data["season"] != int(run_date[:4]):
            raise ValueError(f"KBO 순위 기준일 {data['asOf']}이 run 기준일 {run_date}와 맞지 않습니다.")
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else None
    if previous and data["asOf"] < previous.get("asOf", ""):
        raise ValueError(f"KBO 순위 기준일이 이전보다 과거입니다: {data['asOf']}")
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"KBO standings updated: {data['asOf']}")


if __name__ == "__main__":
    main()
