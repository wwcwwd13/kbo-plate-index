# KBO Plate Index

KBO Plate Index(KPI) 웹페이지의 첫 화면입니다.

현재는 React나 Vite 없이 HTML·CSS·JavaScript로 시작한 화면 골격입니다.

## 현재 화면

- Google Sheet의 외부 공유용 표를 참고한 1군·2군 구단별 Rating 표
- 팀별 타자·투수 이름과 Rating을 가로형으로 배치
- 1군 9명 평균, Rating 구간별 색상, 불확실·오래된 선수의 회색 표시

## 데이터 연결

`data/sheet_reference.json`을 읽어 현재 표를 표시하도록 구성되어 있습니다. 이 파일은 외부 공유용 Google Sheet의 기준 시점 데이터를 웹 표시용으로 정리한 스냅샷입니다. 원자료와 v3 계산 결과는 이 화면 코드와 분리해서 보관합니다.

## 방향

초기 목표는 외부 사용자에게 타석 전체 로그를 보여주는 것이 아니라, 구단별 KPI를 직관적으로 보여주는 것입니다. 타석 단위 before/after와 내부 변수는 검증용 원자료로 유지하고 기본 화면에는 노출하지 않습니다.

향후 계획과 확장 순서는 `KPI_WEB_HANDOFF.md`의 **향후 제품 계획 초안**에 기록합니다. 선수 상세 화면, 날짜별 Rating 스냅샷, Diff 보기, 등록·말소 이력 등을 단계적으로 검토합니다.
