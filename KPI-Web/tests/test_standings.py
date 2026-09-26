import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("standings", Path(__file__).resolve().parents[1] / "scripts" / "update-standings.py")
standings = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(standings)


class StandingsParserTest(unittest.TestCase):
    def test_daily_table_and_incomplete_response(self):
        teams = ["KT", "삼성", "LG", "KIA", "두산", "NC", "롯데", "SSG", "한화", "키움"]
        rows = "".join(f"<tr><td>{rank}</td><td>{team}</td></tr>" for rank, team in enumerate(teams, 1))
        html = f"<p>(2026년 09월25일 기준)</p><table><tr><th>순위</th><th>팀명</th></tr>{rows}</table>"
        result = standings.parse_standings(html)
        self.assertEqual(result["asOf"], "2026-09-25")
        self.assertEqual(len(result["teams"]), 10)
        with self.assertRaises(ValueError):
            standings.parse_standings(html.replace("<td>키움</td>", "<td>없는구단</td>"))


if __name__ == "__main__":
    unittest.main()
