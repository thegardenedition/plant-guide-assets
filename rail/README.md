# rail/ — 이달에 피는 꽃 줄 사전 생성 사진 (백로그 41-5b)

- `photos.json`: 종별 사진 파일명·작성자·출처·**라이선스 이름과 링크**·원본 링크·확인일, 그리고 대표 검수에서 제외한 종(`exclude`). 줄(`plant-guide.js`)이 이 파일만 읽는다.
- `img/*.jpg`: 원본을 **480×360(4:3)으로 줄이고 잘라 낸 사본**(변경 표시: 카드 아래 「사진 출처·라이선스」 목록에 「크기 조정·잘라냄」). 원본의 라이선스(CC BY·CC BY-SA 등)를 그대로 따른다 — BY-SA 사진의 사본도 같은 라이선스.
- 허용 라이선스만: CC0 · CC BY · CC BY-SA · 공공누리 제1유형 · 퍼블릭 도메인 · 국립수목원 표준식물목록(공공데이터포털 이용허락범위 「제한 없음」). NC · ND · 무표기 · GFDL 제외.
- 재생성: `python3 tools/plant-guide-rail-build.py --build --reject "<제외 종>"` (프록시 키는 로컬 `.dev.vars` 에서 메모리로만 읽는다 — 키는 어디에도 쓰지 않는다).
- **삭제 요청이 오면**: 해당 종을 `photos.json` 의 `photos` 에서 빼고(`exclude` 에 추가) `img/` 의 파일을 지운 뒤 배포 — 한 번의 커밋으로 내릴 수 있다.
- 검수: 대표 최종 확인 10-05(제외 30종 반영).

## 제외 기록
- 2026-10-06 **용담(Gentiana scabra) 사진 제외**: Commons 메타데이터의 작성자 칸이 `~~`(업로드 때 서명 물결표가 그대로 남은 것)라 CC BY-SA 의 작성자 표기를 할 수 없고, 원본 파일 설명(de.wikipedia 이전, 작성자 Olbertz, 라이선스 GFDL 재라이선스 표기)이 허용 정책(GFDL 제외)과 맞지 않을 수 있어 정책에 따라 제외. `exclude` 맵에 올려 줄에서도 건너뛴다.
- 2026-10-06 **가는오이풀(Sanguisorba minor)·맥문아재비(Ophiopogon jaburan) 사진 제외**(작성자 Kurt Stüber, 원문 `{{GFDL|migration=relicense}}` 단독 — Commons 는 CC BY-SA 3.0 으로 표시하나 「GFDL 제외」 정책과 충돌할 여지가 있어 보수적으로 제외, 총괄 결정).

## 라이선스 제외 기준 (명문화, 2026-10-06 총괄)
- **Commons 원문(파일 설명 위키텍스트)이 GFDL 단독(재라이선스 `migration=relicense` 포함)이면 제외, GFDL + CC 다중 라이선스(CC 선택 가능)면 허용.** API 의 「LicenseShortName」만 보지 말고 원문 템플릿을 확인한다.
- 작성자 칸이 `~~`·빈칸 등 비정상이면 CC 작성자 표기가 불가능하므로 제외(원 작성자를 파일 이력에서 확실히 확인할 수 있을 때만 정정해 사용).
- 허용: CC0, CC BY, CC BY-SA, 공공누리 제1유형, Public domain, 국립수목원 표준식물목록. 제외: NC/ND/GFDL 단독/라이선스 불명.
